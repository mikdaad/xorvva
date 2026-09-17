using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Ledger.Commands.CloseYear;

/// <summary>
/// Year-end close: posts a closing journal that zeroes every Revenue and Expense account into
/// Retained Earnings (so next year's P&amp;L starts fresh), then marks the year and its periods closed.
/// </summary>
public record CloseYearCommand : IRequest<ApiResponse<FiscalYearDto>>
{
    public Guid Id { get; init; }
    public Guid? CompanyId { get; init; }
}

public class CloseYearHandler : IRequestHandler<CloseYearCommand, ApiResponse<FiscalYearDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IJournalPoster _poster;

    public CloseYearHandler(IXorvaDbContext db, ICurrentTenantService tenant, IJournalPoster poster)
    {
        _db = db;
        _tenant = tenant;
        _poster = poster;
    }

    public async Task<ApiResponse<FiscalYearDto>> Handle(CloseYearCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var year = await _db.Set<FiscalYear>()
            .FirstOrDefaultAsync(y => y.Id == request.Id && y.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Fiscal year", request.Id);
        if (year.IsClosed)
            throw new BadRequestException("This fiscal year is already closed.");

        var plAccountIds = await _db.Set<Account>()
            .Where(a => a.CompanyId == companyId && (a.AccountType == AccountType.Revenue || a.AccountType == AccountType.Expense))
            .Select(a => a.Id)
            .ToListAsync(ct);

        var movements = await (
            from l in _db.Set<JournalLine>()
            join e in _db.Set<JournalEntry>() on l.JournalEntryId equals e.Id
            where e.CompanyId == companyId && e.Date >= year.StartDate && e.Date <= year.EndDate
                  && plAccountIds.Contains(l.AccountId)
            group new { l.Debit, l.Credit } by l.AccountId into g
            select new { AccountId = g.Key, Debit = g.Sum(x => x.Debit), Credit = g.Sum(x => x.Credit) }
        ).ToListAsync(ct);

        // Offset each P&L account back to zero; the net difference lands in Retained Earnings.
        var lines = new List<JournalLineDraft>();
        decimal offsetDr = 0m, offsetCr = 0m;
        foreach (var m in movements)
        {
            var rawNet = Math.Round(m.Debit - m.Credit, 2);
            if (rawNet == 0m) continue;
            if (rawNet > 0m) { lines.Add(new() { AccountId = m.AccountId, Credit = rawNet, Description = "Year-end close" }); offsetCr += rawNet; }
            else { lines.Add(new() { AccountId = m.AccountId, Debit = -rawNet, Description = "Year-end close" }); offsetDr += -rawNet; }
        }

        var netProfit = Math.Round(offsetDr - offsetCr, 2);   // Σrevenue − Σexpense
        if (netProfit > 0m) lines.Add(new() { SystemAccount = SystemAccount.RetainedEarnings, Credit = netProfit, Description = "Net profit to retained earnings" });
        else if (netProfit < 0m) lines.Add(new() { SystemAccount = SystemAccount.RetainedEarnings, Debit = -netProfit, Description = "Net loss to retained earnings" });

        if (lines.Count >= 2)
        {
            await _poster.PostAsync(new JournalDraft
            {
                CompanyId = companyId,
                Date = year.EndDate,
                Description = $"Year-end close {year.Name}",
                SourceType = JournalSourceType.YearEndClose,
                SourceId = year.Id,
                Lines = lines,
            }, ct);
        }

        // Lock the year and all its periods.
        year.IsClosed = true;
        var periods = await _db.Set<FiscalPeriod>().Where(p => p.CompanyId == companyId && p.FiscalYearId == year.Id).ToListAsync(ct);
        foreach (var p in periods) p.IsClosed = true;

        await _db.SaveChangesAsync(ct);
        return ApiResponse<FiscalYearDto>.Ok(year.ToDto(periods), $"{year.Name} closed. Net {(netProfit >= 0 ? "profit" : "loss")} {Math.Abs(netProfit):0.00} moved to retained earnings.");
    }
}
