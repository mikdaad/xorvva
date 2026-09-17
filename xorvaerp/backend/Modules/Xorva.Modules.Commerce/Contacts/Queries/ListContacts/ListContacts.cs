using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Contacts.Entities;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.Contacts.Queries.ListContacts;

public record ListContactsQuery : IRequest<ApiResponse<List<ContactDto>>>
{
    public Guid? CompanyId { get; init; }
    /// <summary>Filter to parties usable on this side of trade (Customer/Both, or Supplier/Both).</summary>
    public ContactType? Role { get; init; }
    public bool IncludeInactive { get; init; }
}

public class ListContactsHandler : IRequestHandler<ListContactsQuery, ApiResponse<List<ContactDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public ListContactsHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<ContactDto>>> Handle(ListContactsQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var query = _db.Set<Contact>().Where(c => c.CompanyId == companyId);
        if (!request.IncludeInactive)
            query = query.Where(c => c.IsActive);

        if (request.Role == ContactType.Customer)
            query = query.Where(c => c.ContactType == ContactType.Customer || c.ContactType == ContactType.Both);
        else if (request.Role == ContactType.Supplier)
            query = query.Where(c => c.ContactType == ContactType.Supplier || c.ContactType == ContactType.Both);

        var contacts = await query.OrderBy(c => c.Name).ToListAsync(ct);
        return ApiResponse<List<ContactDto>>.Ok([.. contacts.Select(c => c.ToDto())]);
    }
}
