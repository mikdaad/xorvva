using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Contacts.Entities;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Purchases.Entities;

namespace Xorva.Modules.Accounting.Purchases.Queries.ListSupplierPayments;

public record ListSupplierPaymentsQuery : IRequest<ApiResponse<List<SupplierPaymentDto>>>
{
    public Guid? CompanyId { get; init; }
}

public class ListSupplierPaymentsHandler : IRequestHandler<ListSupplierPaymentsQuery, ApiResponse<List<SupplierPaymentDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public ListSupplierPaymentsHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<SupplierPaymentDto>>> Handle(ListSupplierPaymentsQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var payments = await _db.Set<SupplierPayment>()
            .Where(p => p.CompanyId == companyId)
            .OrderByDescending(p => p.Date).ThenByDescending(p => p.Number)
            .ToListAsync(ct);

        var names = await _db.Set<Contact>().Where(c => c.CompanyId == companyId)
            .ToDictionaryAsync(c => c.Id, c => c.Name, ct);

        return ApiResponse<List<SupplierPaymentDto>>.Ok([.. payments.Select(p => p.ToDto(names.GetValueOrDefault(p.ContactId)))]);
    }
}
