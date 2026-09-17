using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Currency.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Modules.Accounting.Purchases.Entities;
using Xorva.Modules.Accounting.Sales.Entities;

namespace Xorva.Modules.Accounting.Currency.Commands.RunFxRevaluation;

/// <summary>
/// Period-end unrealized FX revaluation (IAS 21). Restates the base value of every OPEN
/// foreign-currency receivable and payable to the rate on the as-of date, posting the
/// difference to Unrealized FX Gain/Loss — with an automatic reversal on the next day so it
/// never double-counts the realized gain/loss booked when the document is actually settled.
/// </summary>
public record RunFxRevaluationCommand : IRequest<ApiResponse<FxRevaluationResultDto>>
{
    public Guid? CompanyId { get; init; }
    public DateTime AsOfDate { get; init; }
}

public class RunFxRevaluationValidator : AbstractValidator<RunFxRevaluationCommand>
{
    public RunFxRevaluationValidator() => RuleFor(x => x.AsOfDate).NotEmpty();
}

public class RunFxRevaluationHandler : IRequestHandler<RunFxRevaluationCommand, ApiResponse<FxRevaluationResultDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IJournalPoster _poster;

    public RunFxRevaluationHandler(IXorvaDbContext db, ICurrentTenantService tenant, IJournalPoster poster)
    {
        _db = db;
        _tenant = tenant;
        _poster = poster;
    }

    public async Task<ApiResponse<FxRevaluationResultDto>> Handle(RunFxRevaluationCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await AccountingGuard.EnsureSalesActiveAsync(_db, companyId, ct);

        var settings = await _db.Set<AccountingSettings>().FirstOrDefaultAsync(s => s.CompanyId == companyId, ct)
            ?? throw new BadRequestException("Accounting is not set up for this company.");

        var date = DateTime.SpecifyKind(request.AsOfDate.Date, DateTimeKind.Utc);
        var baseCcy = settings.BaseCurrency;

        // One revaluation per date — the entries reverse next day, so re-running would stack.
        var already = await _db.Set<JournalEntry>()
            .AnyAsync(e => e.CompanyId == companyId && e.SourceType == JournalSourceType.Fx && e.Date == date, ct);
        if (already)
            throw new BadRequestException($"Foreign balances have already been revalued for {date:yyyy-MM-dd}.");

        var openInvoices = await _db.Set<Invoice>()
            .Where(i => i.CompanyId == companyId && i.Date <= date && i.BalanceDue > 0m
                     && (i.Status == DocumentStatus.Posted || i.Status == DocumentStatus.PartiallyPaid)
                     && i.Currency != baseCcy)
            .Select(i => new { i.Currency, i.BalanceDue, i.ExchangeRate })
            .ToListAsync(ct);

        var openBills = await _db.Set<Bill>()
            .Where(b => b.CompanyId == companyId && b.Date <= date && b.BalanceDue > 0m
                     && (b.Status == DocumentStatus.Posted || b.Status == DocumentStatus.PartiallyPaid)
                     && b.Currency != baseCcy)
            .Select(b => new { b.Currency, b.BalanceDue, b.ExchangeRate })
            .ToListAsync(ct);

        // Resolve the as-of rate once per currency in play.
        var rates = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);
        foreach (var ccy in openInvoices.Select(x => x.Currency).Concat(openBills.Select(x => x.Currency)).Distinct())
            rates[ccy] = await ExchangeRateResolver.ResolveAsync(_db, companyId, ccy, baseCcy, date, null, ct);

        decimal arDelta = 0m, apDelta = 0m;
        foreach (var i in openInvoices)
            arDelta += Math.Round(i.BalanceDue * rates[i.Currency], 2) - Math.Round(i.BalanceDue * i.ExchangeRate, 2);
        foreach (var b in openBills)
            apDelta += Math.Round(b.BalanceDue * rates[b.Currency], 2) - Math.Round(b.BalanceDue * b.ExchangeRate, 2);
        arDelta = Math.Round(arDelta, 2);
        apDelta = Math.Round(apDelta, 2);

        var netUnrealized = arDelta - apDelta;   // P&L: AR up = gain, AP up = loss

        if (arDelta == 0m && apDelta == 0m)
            return ApiResponse<FxRevaluationResultDto>.Ok(new FxRevaluationResultDto
            {
                AsOfDate = date, NetUnrealized = 0m, Posted = false,
                Message = $"No open foreign balances to revalue at {date:yyyy-MM-dd}.",
            });

        // Build the balanced revaluation journal (base currency).
        var lines = new List<JournalLineDraft>();
        if (arDelta > 0m) lines.Add(new() { AccountId = settings.ReceivableAccountId, Debit = arDelta });
        else if (arDelta < 0m) lines.Add(new() { AccountId = settings.ReceivableAccountId, Credit = -arDelta });
        if (apDelta > 0m) lines.Add(new() { AccountId = settings.PayableAccountId, Credit = apDelta });
        else if (apDelta < 0m) lines.Add(new() { AccountId = settings.PayableAccountId, Debit = -apDelta });

        if (netUnrealized > 0m) lines.Add(new() { SystemAccount = SystemAccount.UnrealizedFxGainLoss, Credit = netUnrealized, Description = "Unrealized FX gain" });
        else if (netUnrealized < 0m) lines.Add(new() { SystemAccount = SystemAccount.UnrealizedFxGainLoss, Debit = -netUnrealized, Description = "Unrealized FX loss" });

        var entryId = await _poster.PostAsync(new JournalDraft
        {
            CompanyId = companyId,
            Date = date,
            Description = $"FX revaluation as of {date:yyyy-MM-dd}",
            SourceType = JournalSourceType.Fx,
            Lines = lines,
        }, ct);

        // Auto-reverse on the next day so settlement's realized FX isn't double-counted.
        var reversal = date.AddDays(1);
        var reversalId = await _poster.PostAsync(new JournalDraft
        {
            CompanyId = companyId,
            Date = reversal,
            Description = $"Reversal of FX revaluation ({date:yyyy-MM-dd})",
            SourceType = JournalSourceType.Reversal,
            Lines = [.. lines.Select(l => new JournalLineDraft
            {
                AccountId = l.AccountId, SystemAccount = l.SystemAccount,
                Debit = l.Credit, Credit = l.Debit, Description = l.Description,
            })],
        }, ct);

        await _db.SaveChangesAsync(ct);

        var verb = netUnrealized >= 0m ? "gain" : "loss";
        return ApiResponse<FxRevaluationResultDto>.Ok(new FxRevaluationResultDto
        {
            AsOfDate = date,
            NetUnrealized = netUnrealized,
            Posted = true,
            JournalEntryId = entryId,
            ReversalEntryId = reversalId,
            Message = $"Revalued open foreign balances at {date:yyyy-MM-dd}: unrealized {verb} of {Math.Abs(netUnrealized):0.00} {baseCcy} (auto-reverses {reversal:yyyy-MM-dd}).",
        }, "FX revaluation posted.");
    }
}
