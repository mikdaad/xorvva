using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Ledger.Commands.PostOpeningBalances;

public record OpeningLineInput
{
    public Guid AccountId { get; init; }
    public decimal Debit { get; init; }
    public decimal Credit { get; init; }
}

/// <summary>
/// One-time opening balances for a company migrating in. Each line sets an account's starting
/// balance (debit or credit); the difference is auto-posted to Retained Earnings so the entry
/// balances. Produces an immutable Opening journal.
/// </summary>
public record PostOpeningBalancesCommand : IRequest<ApiResponse<JournalEntryDto>>
{
    public Guid? CompanyId { get; init; }
    public DateTime AsOf { get; init; }
    public List<OpeningLineInput> Lines { get; init; } = [];
}

public class PostOpeningBalancesValidator : AbstractValidator<PostOpeningBalancesCommand>
{
    public PostOpeningBalancesValidator()
    {
        RuleFor(x => x.AsOf).NotEmpty();
        RuleFor(x => x.Lines).NotEmpty().WithMessage("Enter at least one opening balance.");
    }
}

public class PostOpeningBalancesHandler : IRequestHandler<PostOpeningBalancesCommand, ApiResponse<JournalEntryDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IJournalPoster _poster;

    public PostOpeningBalancesHandler(IXorvaDbContext db, ICurrentTenantService tenant, IJournalPoster poster)
    {
        _db = db;
        _tenant = tenant;
        _poster = poster;
    }

    public async Task<ApiResponse<JournalEntryDto>> Handle(PostOpeningBalancesCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await AccountingGuard.EnsureAccountingActiveAsync(_db, companyId, ct);

        var alreadyPosted = await _db.Set<JournalEntry>()
            .AnyAsync(e => e.CompanyId == companyId && e.SourceType == JournalSourceType.Opening, ct);
        if (alreadyPosted)
            throw new ConflictException("Opening balances have already been posted for this company.");

        var input = request.Lines.Where(l => l.Debit != 0m || l.Credit != 0m).ToList();
        if (input.Count == 0)
            throw new BadRequestException("Enter at least one non-zero opening balance.");

        var lines = input
            .Select(l => new JournalLineDraft { AccountId = l.AccountId, Debit = l.Debit, Credit = l.Credit, Description = "Opening balance" })
            .ToList();

        // Balance the entry: the net difference goes to Retained Earnings.
        var totalDebit = Math.Round(input.Sum(l => l.Debit), 2);
        var totalCredit = Math.Round(input.Sum(l => l.Credit), 2);
        var diff = Math.Round(totalDebit - totalCredit, 2);
        if (diff > 0m) lines.Add(new JournalLineDraft { SystemAccount = SystemAccount.RetainedEarnings, Credit = diff, Description = "Opening balance equity" });
        else if (diff < 0m) lines.Add(new JournalLineDraft { SystemAccount = SystemAccount.RetainedEarnings, Debit = -diff, Description = "Opening balance equity" });

        var date = DateTime.SpecifyKind(request.AsOf.Date, DateTimeKind.Utc);
        var journalId = await _poster.PostAsync(new JournalDraft
        {
            CompanyId = companyId,
            Date = date,
            Description = "Opening balances",
            SourceType = JournalSourceType.Opening,
            Lines = lines,
        }, ct);

        await _db.SaveChangesAsync(ct);

        var entry = await _db.Set<JournalEntry>().Include(e => e.Lines).FirstAsync(e => e.Id == journalId, ct);
        var ids = entry.Lines.Select(l => l.AccountId).Distinct().ToList();
        var accounts = await _db.Set<Account>().Where(a => ids.Contains(a.Id)).ToDictionaryAsync(a => a.Id, ct);
        return ApiResponse<JournalEntryDto>.Ok(entry.ToDto(accounts), "Opening balances posted.");
    }
}
