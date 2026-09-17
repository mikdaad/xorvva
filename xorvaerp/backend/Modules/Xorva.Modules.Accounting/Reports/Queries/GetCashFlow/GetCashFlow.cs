using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Reports.Queries.GetCashFlow;

public record CashFlowRow
{
    public string Category { get; init; } = string.Empty;
    public decimal Amount { get; init; }   // signed: inflow positive, outflow negative
}

public record CashFlowDto
{
    public DateTime From { get; init; }
    public DateTime To { get; init; }
    public decimal OpeningCash { get; init; }
    public decimal TotalInflows { get; init; }
    public decimal TotalOutflows { get; init; }
    public decimal NetChange { get; init; }
    public decimal ClosingCash { get; init; }
    public List<CashFlowRow> Activities { get; init; } = [];
}

/// <summary>
/// Cash Flow — movement across Bank &amp; Cash accounts over a period, with an activity
/// breakdown by what drove the cash (receipts, supplier payments, payroll, etc.).
/// </summary>
public record GetCashFlowQuery : IRequest<ApiResponse<CashFlowDto>>
{
    public Guid? CompanyId { get; init; }
    public DateTime? From { get; init; }
    public DateTime? To { get; init; }
}

public class GetCashFlowHandler : IRequestHandler<GetCashFlowQuery, ApiResponse<CashFlowDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public GetCashFlowHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    private static string Label(JournalSourceType t) => t switch
    {
        JournalSourceType.CustomerPayment => "Customer receipts",
        JournalSourceType.SupplierPayment => "Supplier payments",
        JournalSourceType.Payroll => "Payroll",
        JournalSourceType.Opening => "Opening balances",
        JournalSourceType.Manual => "Manual entries",
        JournalSourceType.Reversal => "Reversals",
        _ => t.ToString(),
    };

    public async Task<ApiResponse<CashFlowDto>> Handle(GetCashFlowQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        var now = DateTime.UtcNow;
        var fromDate = DateTime.SpecifyKind((request.From ?? new DateTime(now.Year, 1, 1)).Date, DateTimeKind.Utc);
        var toDate = DateTime.SpecifyKind((request.To ?? now).Date, DateTimeKind.Utc);

        var cashAccountIds = await _db.Set<Account>()
            .Where(a => a.CompanyId == companyId && (a.AccountSubType == AccountSubType.Bank || a.AccountSubType == AccountSubType.Cash))
            .Select(a => a.Id)
            .ToListAsync(ct);

        if (cashAccountIds.Count == 0)
            return ApiResponse<CashFlowDto>.Ok(new CashFlowDto { From = fromDate, To = toDate });

        var rows = await (
            from l in _db.Set<JournalLine>()
            join e in _db.Set<JournalEntry>() on l.JournalEntryId equals e.Id
            where e.CompanyId == companyId && cashAccountIds.Contains(l.AccountId) && e.Date <= toDate
            select new { e.Date, e.SourceType, l.Debit, l.Credit }
        ).ToListAsync(ct);

        var opening = Math.Round(rows.Where(r => r.Date < fromDate).Sum(r => r.Debit - r.Credit), 2);
        var inPeriod = rows.Where(r => r.Date >= fromDate && r.Date <= toDate).ToList();

        var inflows = Math.Round(inPeriod.Sum(r => r.Debit), 2);
        var outflows = Math.Round(inPeriod.Sum(r => r.Credit), 2);
        var net = Math.Round(inflows - outflows, 2);

        var activities = inPeriod
            .GroupBy(r => r.SourceType)
            .Select(g => new CashFlowRow { Category = Label(g.Key), Amount = Math.Round(g.Sum(x => x.Debit - x.Credit), 2) })
            .Where(r => r.Amount != 0m)
            .OrderByDescending(r => r.Amount)
            .ToList();

        return ApiResponse<CashFlowDto>.Ok(new CashFlowDto
        {
            From = fromDate,
            To = toDate,
            OpeningCash = opening,
            TotalInflows = inflows,
            TotalOutflows = outflows,
            NetChange = net,
            ClosingCash = Math.Round(opening + net, 2),
            Activities = activities,
        });
    }
}
