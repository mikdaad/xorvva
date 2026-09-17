using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Contacts.Entities;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Purchases.Entities;

namespace Xorva.Modules.Accounting.Purchases.Queries.ListBills;

public record ListBillsQuery : IRequest<ApiResponse<List<BillSummaryDto>>>
{
    public Guid? CompanyId { get; init; }
}

public class ListBillsHandler : IRequestHandler<ListBillsQuery, ApiResponse<List<BillSummaryDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public ListBillsHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<BillSummaryDto>>> Handle(ListBillsQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var bills = await _db.Set<Bill>()
            .Where(b => b.CompanyId == companyId)
            .OrderByDescending(b => b.Date).ThenByDescending(b => b.Number)
            .ToListAsync(ct);

        var names = await _db.Set<Contact>().Where(c => c.CompanyId == companyId)
            .ToDictionaryAsync(c => c.Id, c => c.Name, ct);

        return ApiResponse<List<BillSummaryDto>>.Ok([.. bills.Select(b => b.ToSummaryDto(names.GetValueOrDefault(b.ContactId)))]);
    }
}
