using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Reports.Queries.GetBalanceSheet;

public record BalanceSheetRow
{
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public decimal Amount { get; init; }
}

public record BalanceSheetDto
{
    public DateTime AsOf { get; init; }
    public List<BalanceSheetRow> Assets { get; init; } = [];
    public decimal TotalAssets { get; init; }
    public List<BalanceSheetRow> Liabilities { get; init; } = [];
    public decimal TotalLiabilities { get; init; }
    public List<BalanceSheetRow> Equity { get; init; } = [];
    public decimal TotalEquity { get; init; }
    public decimal CurrentYearEarnings { get; init; }
    public bool IsBalanced { get; init; }
}

/// <summary>Balance Sheet as-at a date. Assets = Liabilities + Equity + current-year earnings.</summary>
public record GetBalanceSheetQuery : IRequest<ApiResponse<BalanceSheetDto>>
{
    public Guid? CompanyId { get; init; }
    public DateTime? AsOf { get; init; }
}

public class GetBalanceSheetHandler : IRequestHandler<GetBalanceSheetQuery, ApiResponse<BalanceSheetDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public GetBalanceSheetHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<BalanceSheetDto>> Handle(GetBalanceSheetQuery request, CancellationToken ct)
    {
        // Null scope = CEO consolidated (all companies in the tenant); else a single company.
        var scope = AccountingGuard.ResolveReportScope(_tenant, request.CompanyId);
        var asOf = DateTime.SpecifyKind((request.AsOf ?? DateTime.UtcNow).Date, DateTimeKind.Utc);

        var movements = await (
            from l in _db.Set<JournalLine>()
            join e in _db.Set<JournalEntry>() on l.JournalEntryId equals e.Id
            where (scope == null || e.CompanyId == scope) && e.Date <= asOf
            group new { l.Debit, l.Credit } by l.AccountId into g
            select new { AccountId = g.Key, Debit = g.Sum(x => x.Debit), Credit = g.Sum(x => x.Credit) }
        ).ToListAsync(ct);

        var move = movements.ToDictionary(m => m.AccountId, m => (m.Debit, m.Credit));
        var accounts = await _db.Set<Account>().Where(a => scope == null || a.CompanyId == scope).OrderBy(a => a.Code).ToListAsync(ct);

        var assets = new List<BalanceSheetRow>();
        var liabilities = new List<BalanceSheetRow>();
        var equity = new List<BalanceSheetRow>();
        decimal revenue = 0m, expense = 0m;

        foreach (var a in accounts)
        {
            move.TryGetValue(a.Id, out var m);
            var debitNet = Math.Round(m.Debit - m.Credit, 2);   // natural for assets/expenses
            var creditNet = Math.Round(m.Credit - m.Debit, 2);  // natural for liabilities/equity/revenue

            switch (a.AccountType)
            {
                case AccountType.Asset:
                    if (debitNet != 0m) assets.Add(new() { Code = a.Code, Name = a.Name, Amount = debitNet });
                    break;
                case AccountType.Liability:
                    if (creditNet != 0m) liabilities.Add(new() { Code = a.Code, Name = a.Name, Amount = creditNet });
                    break;
                case AccountType.Equity:
                    if (creditNet != 0m) equity.Add(new() { Code = a.Code, Name = a.Name, Amount = creditNet });
                    break;
                case AccountType.Revenue: revenue += creditNet; break;
                case AccountType.Expense: expense += debitNet; break;
            }
        }

        // Merge same-code accounts across companies (a no-op for a single company).
        static List<BalanceSheetRow> ByCode(List<BalanceSheetRow> rows) => rows
            .GroupBy(r => r.Code)
            .Select(g => new BalanceSheetRow { Code = g.Key, Name = g.First().Name, Amount = Math.Round(g.Sum(x => x.Amount), 2) })
            .Where(r => r.Amount != 0m)
            .OrderBy(r => r.Code)
            .ToList();
        assets = ByCode(assets);
        liabilities = ByCode(liabilities);
        equity = ByCode(equity);

        var currentEarnings = Math.Round(revenue - expense, 2);
        var totalAssets = assets.Sum(r => r.Amount);
        var totalLiabilities = liabilities.Sum(r => r.Amount);
        var totalEquityAccounts = equity.Sum(r => r.Amount);
        var totalEquity = Math.Round(totalEquityAccounts + currentEarnings, 2);

        return ApiResponse<BalanceSheetDto>.Ok(new BalanceSheetDto
        {
            AsOf = asOf,
            Assets = assets,
            TotalAssets = totalAssets,
            Liabilities = liabilities,
            TotalLiabilities = totalLiabilities,
            Equity = equity,
            TotalEquity = totalEquity,
            CurrentYearEarnings = currentEarnings,
            IsBalanced = totalAssets == Math.Round(totalLiabilities + totalEquity, 2),
        });
    }
}
