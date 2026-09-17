using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Reports.Queries.GetProfitAndLoss;

public record PnlRow
{
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public decimal Amount { get; init; }
}

public record ProfitAndLossDto
{
    public DateTime From { get; init; }
    public DateTime To { get; init; }
    public List<PnlRow> Revenue { get; init; } = [];
    public decimal TotalRevenue { get; init; }
    public List<PnlRow> Expenses { get; init; } = [];
    public decimal TotalExpenses { get; init; }
    public decimal NetProfit { get; init; }
}

/// <summary>Profit &amp; Loss over a date range — Revenue − Expenses, from posted journal lines.</summary>
public record GetProfitAndLossQuery : IRequest<ApiResponse<ProfitAndLossDto>>
{
    public Guid? CompanyId { get; init; }
    public DateTime? From { get; init; }
    public DateTime? To { get; init; }
}

public class GetProfitAndLossHandler : IRequestHandler<GetProfitAndLossQuery, ApiResponse<ProfitAndLossDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public GetProfitAndLossHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<ProfitAndLossDto>> Handle(GetProfitAndLossQuery request, CancellationToken ct)
    {
        // Null scope = CEO consolidated (all companies in the tenant); else a single company.
        var scope = AccountingGuard.ResolveReportScope(_tenant, request.CompanyId);
        var now = DateTime.UtcNow;
        var fromDate = DateTime.SpecifyKind((request.From ?? new DateTime(now.Year, 1, 1)).Date, DateTimeKind.Utc);
        var toDate = DateTime.SpecifyKind((request.To ?? now).Date, DateTimeKind.Utc);

        var movements = await (
            from l in _db.Set<JournalLine>()
            join e in _db.Set<JournalEntry>() on l.JournalEntryId equals e.Id
            where (scope == null || e.CompanyId == scope) && e.Date >= fromDate && e.Date <= toDate
            group new { l.Debit, l.Credit } by l.AccountId into g
            select new { AccountId = g.Key, Debit = g.Sum(x => x.Debit), Credit = g.Sum(x => x.Credit) }
        ).ToListAsync(ct);

        var move = movements.ToDictionary(m => m.AccountId, m => (m.Debit, m.Credit));

        var accounts = await _db.Set<Account>()
            .Where(a => (scope == null || a.CompanyId == scope) && (a.AccountType == AccountType.Revenue || a.AccountType == AccountType.Expense))
            .OrderBy(a => a.Code).ToListAsync(ct);

        var revenue = new List<PnlRow>();
        var expenses = new List<PnlRow>();
        foreach (var a in accounts)
        {
            if (!move.TryGetValue(a.Id, out var m)) continue;
            // Revenue is a credit-natural balance; Expense is debit-natural.
            var amount = a.AccountType == AccountType.Revenue
                ? Math.Round(m.Credit - m.Debit, 2)
                : Math.Round(m.Debit - m.Credit, 2);
            if (amount == 0m) continue;
            var row = new PnlRow { Code = a.Code, Name = a.Name, Amount = amount };
            (a.AccountType == AccountType.Revenue ? revenue : expenses).Add(row);
        }

        // Merge same-code accounts across companies (a no-op for a single company).
        static List<PnlRow> ByCode(List<PnlRow> rows) => rows
            .GroupBy(r => r.Code)
            .Select(g => new PnlRow { Code = g.Key, Name = g.First().Name, Amount = Math.Round(g.Sum(x => x.Amount), 2) })
            .Where(r => r.Amount != 0m)
            .OrderBy(r => r.Code)
            .ToList();
        revenue = ByCode(revenue);
        expenses = ByCode(expenses);

        var totalRevenue = revenue.Sum(r => r.Amount);
        var totalExpenses = expenses.Sum(r => r.Amount);

        return ApiResponse<ProfitAndLossDto>.Ok(new ProfitAndLossDto
        {
            From = fromDate,
            To = toDate,
            Revenue = revenue,
            TotalRevenue = totalRevenue,
            Expenses = expenses,
            TotalExpenses = totalExpenses,
            NetProfit = Math.Round(totalRevenue - totalExpenses, 2),
        });
    }
}
