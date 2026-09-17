using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Common;
using Xorva.Modules.HR.DTOs;
using Xorva.Modules.HR.Entities;

namespace Xorva.Modules.HR.Queries.GetMyProfile;

/// <summary>The caller's own employee record (matched by the linked UserId).</summary>
public record GetMyProfileQuery : IRequest<ApiResponse<EmployeeDto>>;

public class GetMyProfileQueryHandler : IRequestHandler<GetMyProfileQuery, ApiResponse<EmployeeDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public GetMyProfileQueryHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<EmployeeDto>> Handle(GetMyProfileQuery request, CancellationToken ct)
    {
        var employee = await _db.Set<Employee>().FirstOrDefaultAsync(e => e.UserId == _tenant.UserId, ct)
            ?? throw new NotFoundException("No employee profile is linked to your account.");

        var dto = await employee.ToDtoAsync(_db, _tenant, ct);
        return ApiResponse<EmployeeDto>.Ok(dto);
    }
}
