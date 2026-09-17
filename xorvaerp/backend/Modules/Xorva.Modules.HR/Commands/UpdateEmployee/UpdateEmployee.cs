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

namespace Xorva.Modules.HR.Commands.UpdateEmployee;

/// <summary>
/// Updates profile + employment fields (NOT salary — that is a separate, approvable
/// endpoint). Department/designation reassignment is allowed here.
/// </summary>
public record UpdateEmployeeCommand : IRequest<ApiResponse<EmployeeDto>>
{
    public Guid Id { get; init; }
    public string FirstName { get; init; } = string.Empty;
    public string LastName { get; init; } = string.Empty;
    public string? Email { get; init; }
    public string? Phone { get; init; }
    public DateOnly? DateOfBirth { get; init; }
    public Gender Gender { get; init; }
    public string? Nationality { get; init; }
    public string? NationalId { get; init; }
    public MaritalStatus? MaritalStatus { get; init; }
    public string? EmergencyContactName { get; init; }
    public string? EmergencyContactPhone { get; init; }
    public string? EmergencyContactRelation { get; init; }
    public Guid DepartmentId { get; init; }
    public Guid DesignationId { get; init; }
    public Guid? ReportingToId { get; init; }
    public Guid? BranchId { get; init; }
    public EmploymentType EmploymentType { get; init; }
    public string? BankName { get; init; }
    public string? AccountNumber { get; init; }
    public string? Iban { get; init; }
}

public class UpdateEmployeeValidator : AbstractValidator<UpdateEmployeeCommand>
{
    public UpdateEmployeeValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.FirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Email).EmailAddress().When(x => !string.IsNullOrEmpty(x.Email));
        RuleFor(x => x.DepartmentId).NotEmpty();
        RuleFor(x => x.DesignationId).NotEmpty();
    }
}

public class UpdateEmployeeCommandHandler : IRequestHandler<UpdateEmployeeCommand, ApiResponse<EmployeeDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public UpdateEmployeeCommandHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<EmployeeDto>> Handle(UpdateEmployeeCommand request, CancellationToken ct)
    {
        var employee = await _db.Set<Employee>().FirstOrDefaultAsync(e => e.Id == request.Id, ct)
            ?? throw new NotFoundException("Employee", request.Id);

        await HrGuard.EnsureCanManageEmployeeAsync(_db, _tenant, employee, ct);
        await EmployeeMapper.ValidateReferencesAsync(_db, employee.CompanyId,
            request.DepartmentId, request.DesignationId, request.ReportingToId,
            request.BranchId, userId: null, selfId: employee.Id, ct);

        employee.FirstName = request.FirstName.Trim();
        employee.LastName = request.LastName.Trim();
        employee.Email = request.Email?.Trim();
        employee.Phone = request.Phone?.Trim();
        employee.DateOfBirth = request.DateOfBirth;
        employee.Gender = request.Gender;
        employee.Nationality = request.Nationality?.Trim();
        employee.NationalId = request.NationalId?.Trim();
        employee.MaritalStatus = request.MaritalStatus;
        employee.EmergencyContactName = request.EmergencyContactName?.Trim();
        employee.EmergencyContactPhone = request.EmergencyContactPhone?.Trim();
        employee.EmergencyContactRelation = request.EmergencyContactRelation?.Trim();
        employee.DepartmentId = request.DepartmentId;
        employee.DesignationId = request.DesignationId;
        employee.ReportingToId = request.ReportingToId;
        employee.BranchId = request.BranchId;
        employee.EmploymentType = request.EmploymentType;
        employee.BankName = request.BankName?.Trim();
        employee.AccountNumber = request.AccountNumber?.Trim();
        employee.Iban = request.Iban?.Trim();

        await _db.SaveChangesAsync(ct);
        var dto = await employee.ToDtoAsync(_db, _tenant, ct);
        return ApiResponse<EmployeeDto>.Ok(dto, "Employee updated.");
    }
}
