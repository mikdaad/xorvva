using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Common;
using Xorva.Modules.HR.DTOs;
using Xorva.Modules.HR.Entities;

namespace Xorva.Modules.HR.Queries.GetEmployee;

public record GetEmployeeQuery(Guid Id) : IRequest<ApiResponse<EmployeeDto>>;

public class GetEmployeeQueryHandler : IRequestHandler<GetEmployeeQuery, ApiResponse<EmployeeDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public GetEmployeeQueryHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<EmployeeDto>> Handle(GetEmployeeQuery request, CancellationToken ct)
    {
        var employee = await _db.Set<Employee>().FirstOrDefaultAsync(e => e.Id == request.Id, ct)
            ?? throw new NotFoundException("Employee", request.Id);

        // Manager can only view their own department's employees.
        if (_tenant.Role == SystemRole.Manager)
        {
            var deptId = await HrGuard.GetCallerDepartmentIdAsync(_db, _tenant, ct);
            if (deptId is null || employee.DepartmentId != deptId.Value)
                throw new ForbiddenException("You can only view employees in your own department.");
        }

        var dto = await employee.ToDtoAsync(_db, _tenant, ct);
        return ApiResponse<EmployeeDto>.Ok(dto);
    }
}
