using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Common;
using Xorva.Modules.HR.DTOs;
using Xorva.Modules.HR.Entities;

namespace Xorva.Modules.HR.Commands.CreateDepartment;

public class CreateDepartmentCommandHandler : IRequestHandler<CreateDepartmentCommand, ApiResponse<DepartmentDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public CreateDepartmentCommandHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<DepartmentDto>> Handle(CreateDepartmentCommand request, CancellationToken ct)
    {
        var companyId = HrGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await HrGuard.EnsureHrActiveAsync(_db, companyId, ct);

        var name = request.Name.Trim();
        var code = request.Code.Trim().ToUpper();

        var clash = await _db.Set<Department>()
            .AnyAsync(d => d.CompanyId == companyId && (d.Name == name || d.Code == code), ct);
        if (clash)
            throw new ConflictException("A department with this name or code already exists.");

        // Parent (if any) must be a department in the SAME company.
        if (request.ParentDepartmentId.HasValue)
        {
            var parentOk = await _db.Set<Department>()
                .AnyAsync(d => d.Id == request.ParentDepartmentId.Value && d.CompanyId == companyId, ct);
            if (!parentOk)
                throw new BadRequestException("Parent department must belong to the same company.");
        }

        var department = new Department
        {
            TenantId = _tenant.TenantId,
            CompanyId = companyId,
            Name = name,
            Code = code,
            Description = request.Description?.Trim(),
            Function = request.Function,
            ParentDepartmentId = request.ParentDepartmentId,
            Rules = HRMappings.SerializeRules(request.Rules)
        };

        _db.Set<Department>().Add(department);
        await _db.SaveChangesAsync(ct);

        return ApiResponse<DepartmentDto>.Ok(department.ToDto(0), "Department created.");
    }
}
