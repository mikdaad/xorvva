using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Contacts.Entities;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Sales.Entities;

namespace Xorva.Modules.Accounting.Sales.Queries.ListCreditNotes;

public record ListCreditNotesQuery : IRequest<ApiResponse<List<CreditNoteSummaryDto>>>
{
    public Guid? CompanyId { get; init; }
}

public class ListCreditNotesHandler : IRequestHandler<ListCreditNotesQuery, ApiResponse<List<CreditNoteSummaryDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public ListCreditNotesHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<CreditNoteSummaryDto>>> Handle(ListCreditNotesQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var notes = await _db.Set<CreditNote>()
            .Where(c => c.CompanyId == companyId)
            .OrderByDescending(c => c.Date).ThenByDescending(c => c.Number)
            .ToListAsync(ct);

        var names = await _db.Set<Contact>().Where(c => c.CompanyId == companyId)
            .ToDictionaryAsync(c => c.Id, c => c.Name, ct);

        return ApiResponse<List<CreditNoteSummaryDto>>.Ok([.. notes.Select(c => c.ToSummaryDto(names.GetValueOrDefault(c.ContactId)))]);
    }
}
