using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Contacts.Entities;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Purchases.Entities;

namespace Xorva.Modules.Accounting.Purchases.Queries.ListDebitNotes;

public record ListDebitNotesQuery : IRequest<ApiResponse<List<DebitNoteSummaryDto>>>
{
    public Guid? CompanyId { get; init; }
}

public class ListDebitNotesHandler : IRequestHandler<ListDebitNotesQuery, ApiResponse<List<DebitNoteSummaryDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public ListDebitNotesHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<DebitNoteSummaryDto>>> Handle(ListDebitNotesQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var notes = await _db.Set<DebitNote>()
            .Where(d => d.CompanyId == companyId)
            .OrderByDescending(d => d.Date).ThenByDescending(d => d.Number)
            .ToListAsync(ct);

        var names = await _db.Set<Contact>().Where(c => c.CompanyId == companyId)
            .ToDictionaryAsync(c => c.Id, c => c.Name, ct);

        return ApiResponse<List<DebitNoteSummaryDto>>.Ok([.. notes.Select(d => d.ToSummaryDto(names.GetValueOrDefault(d.ContactId)))]);
    }
}
