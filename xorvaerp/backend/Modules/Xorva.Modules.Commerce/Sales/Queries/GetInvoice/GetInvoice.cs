using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Contacts.Entities;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Sales.Entities;

namespace Xorva.Modules.Accounting.Sales.Queries.GetInvoice;

public record GetInvoiceQuery : IRequest<ApiResponse<InvoiceDto>>
{
    public Guid Id { get; init; }
    public Guid? CompanyId { get; init; }
}

public class GetInvoiceHandler : IRequestHandler<GetInvoiceQuery, ApiResponse<InvoiceDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public GetInvoiceHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<InvoiceDto>> Handle(GetInvoiceQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var invoice = await _db.Set<Invoice>().Include(i => i.Lines)
            .FirstOrDefaultAsync(i => i.Id == request.Id && i.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Invoice", request.Id);

        var contact = await _db.Set<Contact>().FirstOrDefaultAsync(c => c.Id == invoice.ContactId, ct);
        return ApiResponse<InvoiceDto>.Ok(invoice.ToDto(contact?.Name));
    }
}
