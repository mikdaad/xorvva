using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Common;
using Xorva.Modules.HR.DTOs;
using Xorva.Modules.HR.Entities;
using Xorva.Modules.HR.Enums;

namespace Xorva.Modules.HR.Commands.UpdateDepartment;

public record UpdateDepartmentCommand : IRequest<ApiResponse<DepartmentDto>>
{
    public Guid Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string Code { get; init; } = string.Empty;
    public string? Description { get; init; }
    public DepartmentFunction Function { get; init; } = DepartmentFunction.General;
    public Guid? HeadEmployeeId { get; init; }
    public bool IsActive { get; init; } = true;
    public List<DepartmentRuleDto>? Rules { get; init; }
}

public class UpdateDepartmentValidator : AbstractValidator<UpdateDepartmentCommand>
{
    public UpdateDepartmentValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Code).NotEmpty().MaximumLength(20);
        RuleFor(x => x.Description).MaximumLength(500);
    }
}

public class UpdateDepartmentCommandHandler : IRequestHandler<UpdateDepartmentCommand, ApiResponse<DepartmentDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public UpdateDepartmentCommandHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<DepartmentDto>> Handle(UpdateDepartmentCommand request, CancellationToken ct)
    {
        // Query filter scopes to the caller's company (CEO: any in tenant).
        var dept = await _db.Set<Department>().FirstOrDefaultAsync(d => d.Id == request.Id, ct)
            ?? throw new NotFoundException("Department", request.Id);

        var name = request.Name.Trim();
        var code = request.Code.Trim().ToUpper();

        var clash = await _db.Set<Department>().AnyAsync(d =>
            d.CompanyId == dept.CompanyId && d.Id != dept.Id && (d.Name == name || d.Code == code), ct);
        if (clash)
            throw new ConflictException("Another department with this name or code already exists.");

        // Head must be an employee in the same company.
        if (request.HeadEmployeeId.HasValue)
        {
            var headOk = await _db.Set<Employee>()
                .AnyAsync(e => e.Id == request.HeadEmployeeId.Value && e.CompanyId == dept.CompanyId, ct);
            if (!headOk)
                throw new BadRequestException("Department head must be an employee in the same company.");
        }

        dept.Name = name;
        dept.Code = code;
        dept.Description = request.Description?.Trim();
        dept.Function = request.Function;
        dept.HeadEmployeeId = request.HeadEmployeeId;
        dept.IsActive = request.IsActive;
        if (request.Rules is not null) dept.Rules = HRMappings.SerializeRules(request.Rules);
        await _db.SaveChangesAsync(ct);

        var count = await _db.Set<Employee>().CountAsync(e => e.DepartmentId == dept.Id && e.IsActive, ct);
        return ApiResponse<DepartmentDto>.Ok(dept.ToDto(count), "Department updated.");
    }
}
