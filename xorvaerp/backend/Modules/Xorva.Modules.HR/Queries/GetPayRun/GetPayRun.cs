using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Common;
using Xorva.Modules.HR.DTOs;
using Xorva.Modules.HR.Entities;

namespace Xorva.Modules.HR.Queries.GetPayRun;

public record GetPayRunQuery : IRequest<ApiResponse<PayRunDto>>
{
    public Guid Id { get; init; }
    public Guid? CompanyId { get; init; }
}

public class GetPayRunHandler : IRequestHandler<GetPayRunQuery, ApiResponse<PayRunDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public GetPayRunHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<PayRunDto>> Handle(GetPayRunQuery request, CancellationToken ct)
    {
        var companyId = HrGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var payRun = await _db.Set<PayRun>().Include(p => p.Payslips)
            .FirstOrDefaultAsync(p => p.Id == request.Id && p.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Pay run", request.Id);

        return ApiResponse<PayRunDto>.Ok(payRun.ToDto());
    }
}
