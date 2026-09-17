using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Contacts.Entities;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Purchases.Entities;

namespace Xorva.Modules.Accounting.Purchases.Queries.GetBill;

public record GetBillQuery : IRequest<ApiResponse<BillDto>>
{
    public Guid Id { get; init; }
    public Guid? CompanyId { get; init; }
}

public class GetBillHandler : IRequestHandler<GetBillQuery, ApiResponse<BillDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public GetBillHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<BillDto>> Handle(GetBillQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var bill = await _db.Set<Bill>().Include(b => b.Lines)
            .FirstOrDefaultAsync(b => b.Id == request.Id && b.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Bill", request.Id);

        var contact = await _db.Set<Contact>().FirstOrDefaultAsync(c => c.Id == bill.ContactId, ct);
        return ApiResponse<BillDto>.Ok(bill.ToDto(contact?.Name));
    }
}
