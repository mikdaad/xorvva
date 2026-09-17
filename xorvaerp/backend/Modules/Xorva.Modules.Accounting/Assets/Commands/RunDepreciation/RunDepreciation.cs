using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Assets.Entities;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Assets.Commands.RunDepreciation;

/// <summary>
/// Posts one month of straight-line depreciation for all active assets:
/// DR Depreciation Expense / CR Accumulated Depreciation (per asset). Guarded against
/// running the same month twice.
/// </summary>
public record RunDepreciationCommand : IRequest<ApiResponse<DepreciationResultDto>>
{
    public Guid? CompanyId { get; init; }
    public int Year { get; init; }
    public int Month { get; init; }
}

public class RunDepreciationValidator : AbstractValidator<RunDepreciationCommand>
{
    public RunDepreciationValidator()
    {
        RuleFor(x => x.Year).InclusiveBetween(2000, 2100);
        RuleFor(x => x.Month).InclusiveBetween(1, 12);
    }
}

public class RunDepreciationHandler : IRequestHandler<RunDepreciationCommand, ApiResponse<DepreciationResultDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IJournalPoster _poster;

    public RunDepreciationHandler(IXorvaDbContext db, ICurrentTenantService tenant, IJournalPoster poster)
    {
        _db = db;
        _tenant = tenant;
        _poster = poster;
    }

    public async Task<ApiResponse<DepreciationResultDto>> Handle(RunDepreciationCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await AccountingGuard.EnsureAccountingActiveAsync(_db, companyId, ct);

        var monthStart = DateTime.SpecifyKind(new DateTime(request.Year, request.Month, 1), DateTimeKind.Utc);
        var monthEnd = DateTime.SpecifyKind(new DateTime(request.Year, request.Month, DateTime.DaysInMonth(request.Year, request.Month)), DateTimeKind.Utc);

        var already = await _db.Set<JournalEntry>().AnyAsync(e =>
            e.CompanyId == companyId && e.SourceType == JournalSourceType.Depreciation
            && e.Date >= monthStart && e.Date <= monthEnd, ct);
        if (already)
            throw new ConflictException($"Depreciation for {request.Year}-{request.Month:00} has already been posted.");

        var assets = await _db.Set<FixedAsset>()
            .Where(a => a.CompanyId == companyId && !a.IsDisposed)
            .ToListAsync(ct);

        var lines = new List<JournalLineDraft>();
        var total = 0m;
        var count = 0;
        foreach (var a in assets)
        {
            var depreciable = Math.Round(a.Cost - a.SalvageValue, 2);
            var remaining = Math.Round(depreciable - a.AccumulatedDepreciation, 2);
            if (remaining <= 0m) continue;

            var monthly = Math.Round(depreciable / a.UsefulLifeMonths, 2);
            var amount = Math.Min(monthly, remaining);
            if (amount <= 0m) continue;

            lines.Add(new JournalLineDraft { AccountId = a.DepreciationExpenseAccountId, Debit = amount, Description = $"Depreciation — {a.Name}" });
            lines.Add(new JournalLineDraft { AccountId = a.AccumulatedDepreciationAccountId, Credit = amount, Description = $"Depreciation — {a.Name}" });
            a.AccumulatedDepreciation = Math.Round(a.AccumulatedDepreciation + amount, 2);
            total += amount;
            count++;
        }

        if (lines.Count == 0)
            return ApiResponse<DepreciationResultDto>.Ok(new DepreciationResultDto(), "No assets needed depreciation this month.");

        var journalId = await _poster.PostAsync(new JournalDraft
        {
            CompanyId = companyId,
            Date = monthEnd,
            Description = $"Depreciation {request.Year}-{request.Month:00}",
            SourceType = JournalSourceType.Depreciation,
            Lines = lines,
        }, ct);

        await _db.SaveChangesAsync(ct);

        return ApiResponse<DepreciationResultDto>.Ok(
            new DepreciationResultDto { AssetsDepreciated = count, TotalDepreciation = Math.Round(total, 2), JournalEntryId = journalId },
            $"Depreciated {count} asset(s) for {request.Year}-{request.Month:00}.");
    }
}
