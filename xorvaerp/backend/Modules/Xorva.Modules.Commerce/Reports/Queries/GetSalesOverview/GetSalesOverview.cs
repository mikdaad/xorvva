using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Contacts.Entities;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Purchases.Entities;
using Xorva.Modules.Accounting.Sales.Entities;

namespace Xorva.Modules.Accounting.Reports.Queries.GetSalesOverview;

/// <summary>Headline CRM &amp; Sales figures — read straight from contacts/invoices/bills
/// (no ledger dependency, so it works even before Accounting posts).</summary>
public record SalesOverviewDto
{
    public int CustomerCount { get; init; }
    public int SupplierCount { get; init; }
    public int OpenInvoicesCount { get; init; }
    public decimal Receivables { get; init; }
    public int OverdueInvoicesCount { get; init; }
    public decimal OverdueAmount { get; init; }
    public int OpenBillsCount { get; init; }
    public decimal Payables { get; init; }
    public decimal SalesThisMonth { get; init; }
}

public record GetSalesOverviewQuery : IRequest<ApiResponse<SalesOverviewDto>>
{
    public Guid? CompanyId { get; init; }
}

public class GetSalesOverviewHandler : IRequestHandler<GetSalesOverviewQuery, ApiResponse<SalesOverviewDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public GetSalesOverviewHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<SalesOverviewDto>> Handle(GetSalesOverviewQuery request, CancellationToken ct)
    {
        var scope = AccountingGuard.ResolveReportScope(_tenant, request.CompanyId);
        var now = DateTime.UtcNow;
        var today = DateTime.SpecifyKind(now.Date, DateTimeKind.Utc);
        var monthStart = DateTime.SpecifyKind(new DateTime(now.Year, now.Month, 1), DateTimeKind.Utc);

        var contacts = _db.Set<Contact>().Where(c => (scope == null || c.CompanyId == scope) && c.IsActive);
        var openInvoices = _db.Set<Invoice>().Where(i => (scope == null || i.CompanyId == scope)
            && (i.Status == DocumentStatus.Posted || i.Status == DocumentStatus.PartiallyPaid) && i.BalanceDue > 0);
        var overdueInvoices = openInvoices.Where(i => i.DueDate < today);
        var openBills = _db.Set<Bill>().Where(b => (scope == null || b.CompanyId == scope)
            && (b.Status == DocumentStatus.Posted || b.Status == DocumentStatus.PartiallyPaid) && b.BalanceDue > 0);
        var salesThisMonth = _db.Set<Invoice>().Where(i => (scope == null || i.CompanyId == scope)
            && i.Date >= monthStart && i.Status != DocumentStatus.Draft && i.Status != DocumentStatus.Voided);

        var dto = new SalesOverviewDto
        {
            CustomerCount = await contacts.CountAsync(c => c.ContactType == ContactType.Customer || c.ContactType == ContactType.Both, ct),
            SupplierCount = await contacts.CountAsync(c => c.ContactType == ContactType.Supplier || c.ContactType == ContactType.Both, ct),
            OpenInvoicesCount = await openInvoices.CountAsync(ct),
            Receivables = Math.Round(await openInvoices.SumAsync(i => (decimal?)i.BalanceDue, ct) ?? 0m, 2),
            OverdueInvoicesCount = await overdueInvoices.CountAsync(ct),
            OverdueAmount = Math.Round(await overdueInvoices.SumAsync(i => (decimal?)i.BalanceDue, ct) ?? 0m, 2),
            OpenBillsCount = await openBills.CountAsync(ct),
            Payables = Math.Round(await openBills.SumAsync(b => (decimal?)b.BalanceDue, ct) ?? 0m, 2),
            SalesThisMonth = Math.Round(await salesThisMonth.SumAsync(i => (decimal?)i.Total, ct) ?? 0m, 2),
        };

        return ApiResponse<SalesOverviewDto>.Ok(dto);
    }
}
