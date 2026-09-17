using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Contacts.Entities;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Sales.Entities;

namespace Xorva.Modules.Accounting.Reports.Queries.GetAgedReceivables;

public record AgedRow
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

public record AgedReceivablesDto
{
    public DateTime AsOf { get; init; }
    public List<AgedRow> Rows { get; init; } = [];
    public AgedRow Totals { get; init; } = new();
}

/// <summary>Aged Receivables — open customer balances bucketed by how overdue they are.</summary>
public record GetAgedReceivablesQuery : IRequest<ApiResponse<AgedReceivablesDto>>
{
    public Guid? CompanyId { get; init; }
}

public class GetAgedReceivablesHandler : IRequestHandler<GetAgedReceivablesQuery, ApiResponse<AgedReceivablesDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public GetAgedReceivablesHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<AgedReceivablesDto>> Handle(GetAgedReceivablesQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        var today = DateTime.SpecifyKind(DateTime.UtcNow.Date, DateTimeKind.Utc);

        var open = await _db.Set<Invoice>()
            .Where(i => i.CompanyId == companyId
                && (i.Status == DocumentStatus.Posted || i.Status == DocumentStatus.PartiallyPaid)
                && i.BalanceDue > 0)
            .Select(i => new { i.ContactId, i.DueDate, i.BalanceDue })
            .ToListAsync(ct);

        var names = await _db.Set<Contact>().Where(c => c.CompanyId == companyId)
            .ToDictionaryAsync(c => c.Id, c => c.Name, ct);

        var rows = open.GroupBy(i => i.ContactId).Select(g =>
        {
            decimal cur = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0;
            foreach (var i in g)
            {
                var days = (today - i.DueDate.Date).Days;
                if (days <= 0) cur += i.BalanceDue;
                else if (days <= 30) b1 += i.BalanceDue;
                else if (days <= 60) b2 += i.BalanceDue;
                else if (days <= 90) b3 += i.BalanceDue;
                else b4 += i.BalanceDue;
            }
            return new AgedRow
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

        var totals = new AgedRow
        {
            ContactName = "Total",
            Current = Math.Round(rows.Sum(r => r.Current), 2),
            Days1To30 = Math.Round(rows.Sum(r => r.Days1To30), 2),
            Days31To60 = Math.Round(rows.Sum(r => r.Days31To60), 2),
            Days61To90 = Math.Round(rows.Sum(r => r.Days61To90), 2),
            Days90Plus = Math.Round(rows.Sum(r => r.Days90Plus), 2),
            Total = Math.Round(rows.Sum(r => r.Total), 2),
        };

        return ApiResponse<AgedReceivablesDto>.Ok(new AgedReceivablesDto { AsOf = today, Rows = rows, Totals = totals });
    }
}
