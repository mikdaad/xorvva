using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Modules.Accounting.Sales.Entities;

namespace Xorva.Modules.Accounting.Reports.Queries.GetFinanceDashboard;

public record MonthlyPoint
{
    public string Month { get; init; } = string.Empty;   // "2026-04"
    public decimal Revenue { get; init; }
}

public record FinanceDashboardDto
{
    public decimal CashPosition { get; init; }
    public decimal AccountsReceivable { get; init; }
    public decimal AccountsPayable { get; init; }
    public decimal RevenueYtd { get; init; }
    public decimal ExpensesYtd { get; init; }
    public decimal NetProfitYtd { get; init; }
    public int OverdueCount { get; init; }
    public decimal OverdueAmount { get; init; }
    public int OpenInvoicesCount { get; init; }
    public List<MonthlyPoint> RevenueTrend { get; init; } = [];
}

/// <summary>Finance home: cash, AR/AP, YTD P&amp;L, overdue invoices, 6-month revenue trend.</summary>
public record GetFinanceDashboardQuery : IRequest<ApiResponse<FinanceDashboardDto>>
{
    public Guid? CompanyId { get; init; }
}

public class GetFinanceDashboardHandler : IRequestHandler<GetFinanceDashboardQuery, ApiResponse<FinanceDashboardDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public GetFinanceDashboardHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<FinanceDashboardDto>> Handle(GetFinanceDashboardQuery request, CancellationToken ct)
    {
        // Null scope = CEO consolidated (all companies in the tenant); else a single company.
        var scope = AccountingGuard.ResolveReportScope(_tenant, request.CompanyId);
        var now = DateTime.UtcNow;
        var yearStart = DateTime.SpecifyKind(new DateTime(now.Year, 1, 1), DateTimeKind.Utc);
        var today = DateTime.SpecifyKind(now.Date, DateTimeKind.Utc);

        var accounts = await _db.Set<Account>().Where(a => scope == null || a.CompanyId == scope).ToListAsync(ct);
        decimal Balance(Func<Account, bool> pred) => Math.Round(accounts.Where(pred).Sum(a => a.CurrentBalance), 2);

        var cash = Balance(a => a.AccountSubType is AccountSubType.Bank or AccountSubType.Cash);
        var ar = Balance(a => a.AccountSubType == AccountSubType.AccountsReceivable);
        var ap = Balance(a => a.AccountSubType == AccountSubType.AccountsPayable);

        // YTD revenue/expense + last-6-months revenue, from posted lines joined to entries.
        var sixMonthsAgo = DateTime.SpecifyKind(new DateTime(now.Year, now.Month, 1), DateTimeKind.Utc).AddMonths(-5);
        var rows = await (
            from l in _db.Set<JournalLine>()
            join e in _db.Set<JournalEntry>() on l.JournalEntryId equals e.Id
            join a in _db.Set<Account>() on l.AccountId equals a.Id
            where (scope == null || e.CompanyId == scope) && e.Date >= yearStart
                  && (a.AccountType == AccountType.Revenue || a.AccountType == AccountType.Expense)
            select new { e.Date, a.AccountType, l.Debit, l.Credit }
        ).ToListAsync(ct);

        var revenueYtd = Math.Round(rows.Where(r => r.AccountType == AccountType.Revenue).Sum(r => r.Credit - r.Debit), 2);
        var expensesYtd = Math.Round(rows.Where(r => r.AccountType == AccountType.Expense).Sum(r => r.Debit - r.Credit), 2);

        var trend = Enumerable.Range(0, 6)
            .Select(i => sixMonthsAgo.AddMonths(i))
            .Select(m => new MonthlyPoint
            {
                Month = m.ToString("yyyy-MM"),
                Revenue = Math.Round(rows
                    .Where(r => r.AccountType == AccountType.Revenue && r.Date.Year == m.Year && r.Date.Month == m.Month)
                    .Sum(r => r.Credit - r.Debit), 2),
            })
            .ToList();

        var openInvoices = await _db.Set<Invoice>()
            .Where(i => (scope == null || i.CompanyId == scope) && (i.Status == DocumentStatus.Posted || i.Status == DocumentStatus.PartiallyPaid) && i.BalanceDue > 0)
            .Select(i => new { i.DueDate, i.BalanceDue })
            .ToListAsync(ct);

        var overdue = openInvoices.Where(i => i.DueDate < today).ToList();

        return ApiResponse<FinanceDashboardDto>.Ok(new FinanceDashboardDto
        {
            CashPosition = cash,
            AccountsReceivable = ar,
            AccountsPayable = ap,
            RevenueYtd = revenueYtd,
            ExpensesYtd = expensesYtd,
            NetProfitYtd = Math.Round(revenueYtd - expensesYtd, 2),
            OverdueCount = overdue.Count,
            OverdueAmount = Math.Round(overdue.Sum(i => i.BalanceDue), 2),
            OpenInvoicesCount = openInvoices.Count,
            RevenueTrend = trend,
        });
    }
}
