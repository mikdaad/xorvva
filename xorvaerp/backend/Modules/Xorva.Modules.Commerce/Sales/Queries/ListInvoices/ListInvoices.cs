using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Contacts.Entities;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Sales.Entities;

namespace Xorva.Modules.Accounting.Sales.Queries.ListInvoices;

public record ListInvoicesQuery : IRequest<ApiResponse<List<InvoiceSummaryDto>>>
{
    public Guid? CompanyId { get; init; }
}

public class ListInvoicesHandler : IRequestHandler<ListInvoicesQuery, ApiResponse<List<InvoiceSummaryDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public ListInvoicesHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<InvoiceSummaryDto>>> Handle(ListInvoicesQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var invoices = await _db.Set<Invoice>()
            .Where(i => i.CompanyId == companyId)
            .OrderByDescending(i => i.Date).ThenByDescending(i => i.Number)
            .ToListAsync(ct);

        var names = await _db.Set<Contact>().Where(c => c.CompanyId == companyId)
            .ToDictionaryAsync(c => c.Id, c => c.Name, ct);

        return ApiResponse<List<InvoiceSummaryDto>>.Ok(
            [.. invoices.Select(i => i.ToSummaryDto(names.GetValueOrDefault(i.ContactId)))]);
    }
}
