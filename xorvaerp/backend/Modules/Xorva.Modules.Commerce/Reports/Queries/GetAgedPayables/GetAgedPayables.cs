using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Contacts.Entities;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Purchases.Entities;

namespace Xorva.Modules.Accounting.Reports.Queries.GetAgedPayables;

public record AgedPayableRow
{
    public Guid ContactId { get; init; }
    public string ContactName { get; init; } = string.Empty;
    public decimal Current { get; init; }
    public decimal Days1To30 { get; init; }
    public decimal Days31To60 { get; init; }
    public decimal Days61To90 { get; init; }
    public decimal Days90Plus { get; init; }
    public decimal Total { get; init; }
}

public record AgedPayablesDto
{
    public DateTime AsOf { get; init; }
    public List<AgedPayableRow> Rows { get; init; } = [];
    public AgedPayableRow Totals { get; init; } = new();
}

/// <summary>Aged Payables — open supplier balances bucketed by how overdue they are.</summary>
public record GetAgedPayablesQuery : IRequest<ApiResponse<AgedPayablesDto>>
{
    public Guid? CompanyId { get; init; }
}

public class GetAgedPayablesHandler : IRequestHandler<GetAgedPayablesQuery, ApiResponse<AgedPayablesDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public GetAgedPayablesHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<AgedPayablesDto>> Handle(GetAgedPayablesQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        var today = DateTime.SpecifyKind(DateTime.UtcNow.Date, DateTimeKind.Utc);

        var open = await _db.Set<Bill>()
            .Where(b => b.CompanyId == companyId
                && (b.Status == DocumentStatus.Posted || b.Status == DocumentStatus.PartiallyPaid)
                && b.BalanceDue > 0)
            .Select(b => new { b.ContactId, b.DueDate, b.BalanceDue })
            .ToListAsync(ct);

        var names = await _db.Set<Contact>().Where(c => c.CompanyId == companyId)
            .ToDictionaryAsync(c => c.Id, c => c.Name, ct);

        var rows = open.GroupBy(b => b.ContactId).Select(g =>
        {
            decimal cur = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0;
            foreach (var b in g)
            {
                var days = (today - b.DueDate.Date).Days;
                if (days <= 0) cur += b.BalanceDue;
                else if (days <= 30) b1 += b.BalanceDue;
                else if (days <= 60) b2 += b.BalanceDue;
                else if (days <= 90) b3 += b.BalanceDue;
                else b4 += b.BalanceDue;
            }
            return new AgedPayableRow
            {
                ContactId = g.Key,
                ContactName = names.GetValueOrDefault(g.Key, "—"),
                Current = Math.Round(cur, 2),
                Days1To30 = Math.Round(b1, 2),
                Days31To60 = Math.Round(b2, 2),
                Days61To90 = Math.Round(b3, 2),
                Days90Plus = Math.Round(b4, 2),
                Total = Math.Round(cur + b1 + b2 + b3 + b4, 2),
            };
        }).OrderByDescending(r => r.Total).ToList();

        var totals = new AgedPayableRow
        {
            ContactName = "Total",
            Current = Math.Round(rows.Sum(r => r.Current), 2),
            Days1To30 = Math.Round(rows.Sum(r => r.Days1To30), 2),
            Days31To60 = Math.Round(rows.Sum(r => r.Days31To60), 2),
            Days61To90 = Math.Round(rows.Sum(r => r.Days61To90), 2),
            Days90Plus = Math.Round(rows.Sum(r => r.Days90Plus), 2),
            Total = Math.Round(rows.Sum(r => r.Total), 2),
        };

        return ApiResponse<AgedPayablesDto>.Ok(new AgedPayablesDto { AsOf = today, Rows = rows, Totals = totals });
    }
}
