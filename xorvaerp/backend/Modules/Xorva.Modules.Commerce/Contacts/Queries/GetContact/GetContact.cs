using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Contacts.Entities;
using Xorva.Modules.Accounting.DTOs;

namespace Xorva.Modules.Accounting.Contacts.Queries.GetContact;

public record GetContactQuery : IRequest<ApiResponse<ContactDto>>
{
    public Guid Id { get; init; }
    public Guid? CompanyId { get; init; }
}

public class GetContactHandler : IRequestHandler<GetContactQuery, ApiResponse<ContactDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public GetContactHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<ContactDto>> Handle(GetContactQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        var contact = await _db.Set<Contact>()
            .FirstOrDefaultAsync(c => c.Id == request.Id && c.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Contact", request.Id);
        return ApiResponse<ContactDto>.Ok(contact.ToDto());
    }
}
