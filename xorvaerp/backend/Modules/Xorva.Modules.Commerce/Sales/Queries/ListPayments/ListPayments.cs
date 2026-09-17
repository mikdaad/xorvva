using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Contacts.Entities;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Sales.Entities;

namespace Xorva.Modules.Accounting.Sales.Queries.ListPayments;

public record ListPaymentsQuery : IRequest<ApiResponse<List<CustomerPaymentDto>>>
{
    public Guid? CompanyId { get; init; }
}

public class ListPaymentsHandler : IRequestHandler<ListPaymentsQuery, ApiResponse<List<CustomerPaymentDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public ListPaymentsHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<CustomerPaymentDto>>> Handle(ListPaymentsQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var payments = await _db.Set<CustomerPayment>().Include(p => p.Allocations)
            .Where(p => p.CompanyId == companyId)
            .OrderByDescending(p => p.Date).ThenByDescending(p => p.Number)
            .ToListAsync(ct);

        var names = await _db.Set<Contact>().Where(c => c.CompanyId == companyId)
            .ToDictionaryAsync(c => c.Id, c => c.Name, ct);

        return ApiResponse<List<CustomerPaymentDto>>.Ok(
            [.. payments.Select(p => p.ToDto(names.GetValueOrDefault(p.ContactId)))]);
    }
}
