using Microsoft.EntityFrameworkCore;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Common;

/// <summary>
/// THE ENGINE. Validates and stages a balanced double-entry journal. Every document handler
/// (invoices, bills, payments, payroll) posts through here — no handler writes journals by hand,
/// so one set of rules and tests covers every transaction type.
///
/// Stages onto the current <see cref="IXorvaDbContext"/> and returns the entry id; the CALLER
/// commits (one unit of work with the source document → atomicity).
/// </summary>
public class JournalPoster : IJournalPoster
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public JournalPoster(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<Guid> PostAsync(JournalDraft draft, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, draft.CompanyId);

        var lines = draft.Lines ?? [];
        if (lines.Count < 2)
            throw new BadRequestException("A journal needs at least two lines.");

        foreach (var l in lines)
        {
            if (l.Debit < 0 || l.Credit < 0)
                throw new BadRequestException("Debit and credit amounts cannot be negative.");
            if (l.Debit > 0 == l.Credit > 0) // both > 0, or both 0
                throw new BadRequestException("Each line must be either a debit OR a credit.");
        }

        var totalDebit = Math.Round(lines.Sum(l => l.Debit), 2);
        var totalCredit = Math.Round(lines.Sum(l => l.Credit), 2);
        if (totalDebit != totalCredit)
            throw new BadRequestException($"Journal is not balanced: debits {totalDebit:0.00} ≠ credits {totalCredit:0.00}.");
        if (totalDebit == 0m)
            throw new BadRequestException("A journal cannot be for a zero amount.");

        var date = DateTime.SpecifyKind(draft.Date.Date, DateTimeKind.Utc);
        await PeriodGuard.EnsureOpenAsync(_db, companyId, date, ct);

        var settings = await _db.Set<AccountingSettings>().FirstOrDefaultAsync(s => s.CompanyId == companyId, ct)
            ?? throw new BadRequestException("Accounting is not set up for this company — create the chart of accounts first.");

        // Resolve each line to a concrete account id: a SystemAccount maps via settings,
        // otherwise the explicit AccountId is used.
        var effectiveIds = new Guid[lines.Count];
        for (var i = 0; i < lines.Count; i++)
        {
            var draftLine = lines[i];
            var id = draftLine.SystemAccount is { } sa ? ResolveSystemAccount(settings, sa) : draftLine.AccountId;
            if (id == Guid.Empty)
                throw new BadRequestException("A required system account is not configured for this company.");
            effectiveIds[i] = id;
        }

        // Accounts must exist, be active, and belong to this company.
        var accountIds = effectiveIds.Distinct().ToList();
        var accounts = await _db.Set<Account>()
            .Where(a => a.CompanyId == companyId && accountIds.Contains(a.Id))
            .ToListAsync(ct);
        if (accounts.Count != accountIds.Count)
            throw new BadRequestException("One or more accounts do not exist in this company's chart of accounts.");
        if (accounts.Exists(a => !a.IsActive))
            throw new BadRequestException("Cannot post to an inactive account.");

        var entry = new JournalEntry
        {
            TenantId = _tenant.TenantId,
            CompanyId = companyId,
            EntryNumber = NumberSequence.Next(settings, DocumentSequence.Journal, date),
            Date = date,
            Description = draft.Description?.Trim() ?? string.Empty,
            SourceType = draft.SourceType,
            SourceId = draft.SourceId,
            Status = JournalStatus.Posted,
            PostedAt = DateTime.UtcNow,
            PostedBy = _tenant.UserId == Guid.Empty ? null : _tenant.UserId,
            TotalDebit = totalDebit,
            TotalCredit = totalCredit,
        };

        var byId = accounts.ToDictionary(a => a.Id);
        for (var i = 0; i < lines.Count; i++)
        {
            var l = lines[i];
            var accId = effectiveIds[i];
            entry.Lines.Add(new JournalLine
            {
                TenantId = _tenant.TenantId,
                CompanyId = companyId,
                JournalEntryId = entry.Id,
                AccountId = accId,
                Debit = Math.Round(l.Debit, 2),
                Credit = Math.Round(l.Credit, 2),
                ContactId = l.ContactId,
                TaxRateId = l.TaxRateId,
                Description = l.Description?.Trim(),
            });

            // Maintain the cached running balance as a natural (positive) balance per side.
            var account = byId[accId];
            var delta = Math.Round(l.Debit - l.Credit, 2);
            account.CurrentBalance += account.NormalBalance == NormalBalance.Debit ? delta : -delta;
        }

        _db.Set<JournalEntry>().Add(entry);
        return entry.Id; // caller commits
    }

    private static Guid ResolveSystemAccount(AccountingSettings s, Xorva.Core.Enums.SystemAccount account) => account switch
    {
        Xorva.Core.Enums.SystemAccount.Bank => s.DefaultBankAccountId,
        Xorva.Core.Enums.SystemAccount.Cash => s.CashAccountId,
        Xorva.Core.Enums.SystemAccount.AccountsReceivable => s.ReceivableAccountId,
        Xorva.Core.Enums.SystemAccount.AccountsPayable => s.PayableAccountId,
        Xorva.Core.Enums.SystemAccount.VatOutput => s.VatOutputAccountId,
        Xorva.Core.Enums.SystemAccount.VatInput => s.VatInputAccountId,
        Xorva.Core.Enums.SystemAccount.RetainedEarnings => s.RetainedEarningsAccountId,
        Xorva.Core.Enums.SystemAccount.Rounding => s.RoundingAccountId,
        Xorva.Core.Enums.SystemAccount.SalaryExpense => s.SalaryExpenseAccountId,
        Xorva.Core.Enums.SystemAccount.SalaryPayable => s.SalaryPayableAccountId,
        Xorva.Core.Enums.SystemAccount.Sales => s.SalesAccountId,
        Xorva.Core.Enums.SystemAccount.Purchase => s.PurchaseAccountId,
        Xorva.Core.Enums.SystemAccount.FxGainLoss => s.FxGainLossAccountId,
        Xorva.Core.Enums.SystemAccount.UnrealizedFxGainLoss => s.UnrealizedFxGainLossAccountId,
        _ => Guid.Empty,
    };
}
