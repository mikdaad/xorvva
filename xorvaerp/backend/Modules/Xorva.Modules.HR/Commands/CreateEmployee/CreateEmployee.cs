using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Approvals;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Common;
using Xorva.Modules.HR.DTOs;
using Xorva.Modules.HR.Entities;
using Xorva.Modules.HR.Enums;

namespace Xorva.Modules.HR.Commands.CreateEmployee;

/// <summary>
/// Adds a new employee. Approvable ("New Hire") — when a rule exists this is queued
/// instead of created immediately. Salary flows through the (encrypted) approval payload.
/// </summary>
public record CreateEmployeeCommand : IRequest<ApiResponse<EmployeeDto>>, IApprovableAction
{
    public Guid? CompanyId { get; init; }
    public string FirstName { get; init; } = string.Empty;
    public string LastName { get; init; } = string.Empty;
    public string? Email { get; init; }
    public string? Phone { get; init; }
    public DateOnly? DateOfBirth { get; init; }
    public Gender Gender { get; init; } = Gender.Other;
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
    public DateOnly JoinDate { get; init; }
    public EmploymentType EmploymentType { get; init; } = EmploymentType.FullTime;
    public decimal BasicSalary { get; init; }
    public string? Currency { get; init; }
    public string? BankName { get; init; }
    public string? AccountNumber { get; init; }
    public string? Iban { get; init; }

    /// <summary>Link this employee to an EXISTING login.</summary>
    public Guid? UserId { get; init; }

    // ─── Grant system access (person-centric: create a linked login in one step) ───
    /// <summary>When true, create a new login for this person and link it.</summary>
    public bool GrantAccess { get; init; }
    /// <summary>Role for the new login. The caller can only grant lower-privilege roles.</summary>
    public SystemRole AccessRole { get; init; } = SystemRole.Employee;
    /// <summary>Initial password for the new login (encrypted at rest in the approval payload).</summary>
    public string? AccessPassword { get; init; }

    // ─── IApprovableAction ─────────────────────────────────────
    public const string ActionKey = "HR.CreateEmployee";
    public string ApprovalActionKey => ActionKey;
    public string ApprovalSummary => $"New Hire: {FirstName} {LastName}";
    public Guid? ApprovalCompanyId => CompanyId;
}

public class CreateEmployeeValidator : AbstractValidator<CreateEmployeeCommand>
{
    public CreateEmployeeValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Email).EmailAddress().When(x => !string.IsNullOrEmpty(x.Email));
        RuleFor(x => x.DepartmentId).NotEmpty();
        RuleFor(x => x.DesignationId).NotEmpty();
        RuleFor(x => x.JoinDate).NotEmpty();
        RuleFor(x => x.BasicSalary).GreaterThanOrEqualTo(0).WithMessage("Salary cannot be negative.");

        // When granting access, a valid email + a password are required to create the login.
        When(x => x.GrantAccess, () =>
        {
            RuleFor(x => x.Email).NotEmpty().EmailAddress()
                .WithMessage("A valid email is required to grant system access.");
            RuleFor(x => x.AccessPassword).NotEmpty().MinimumLength(8)
                .WithMessage("Password must be at least 8 characters.");
        });
    }
}

public class CreateEmployeeCommandHandler : IRequestHandler<CreateEmployeeCommand, ApiResponse<EmployeeDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IUserProvisioningService _provisioning;

    public CreateEmployeeCommandHandler(
        IXorvaDbContext db, ICurrentTenantService tenant, IUserProvisioningService provisioning)
    {
        _db = db;
        _tenant = tenant;
        _provisioning = provisioning;
    }

    public async Task<ApiResponse<EmployeeDto>> Handle(CreateEmployeeCommand request, CancellationToken ct)
    {
        var companyId = HrGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await HrGuard.EnsureHrActiveAsync(_db, companyId, ct);

        await EmployeeMapper.ValidateReferencesAsync(_db, companyId,
            request.DepartmentId, request.DesignationId, request.ReportingToId,
            request.BranchId, request.UserId, selfId: null, ct);

        // Person-centric: optionally create a linked login in the same company + department,
        // so the new hire can sign in (and a Manager gets the department scoping their team).
        // Runs BEFORE the retry loop so the login is created exactly once.
        var linkedUserId = request.UserId;
        if (request.GrantAccess && !linkedUserId.HasValue)
        {
            var login = await _provisioning.ProvisionAsync(new ProvisionLoginRequest
            {
                Email = request.Email!,
                Password = request.AccessPassword!,
                FirstName = request.FirstName,
                LastName = request.LastName,
                Role = request.AccessRole,
                CompanyId = companyId,
                DepartmentId = request.DepartmentId
            }, ct);
            linkedUserId = login.Id;
        }

        // Generate code + save, retrying if a concurrent insert took the same code.
        for (var attempt = 0; ; attempt++)
        {
            var employee = new Employee
            {
                TenantId = _tenant.TenantId,
                CompanyId = companyId,
                EmployeeCode = await EmployeeMapper.NextEmployeeCodeAsync(_db, companyId, ct),
                FirstName = request.FirstName.Trim(),
                LastName = request.LastName.Trim(),
                Email = request.Email?.Trim(),
                Phone = request.Phone?.Trim(),
                DateOfBirth = request.DateOfBirth,
                Gender = request.Gender,
                Nationality = request.Nationality?.Trim(),
                NationalId = request.NationalId?.Trim(),
                MaritalStatus = request.MaritalStatus,
                EmergencyContactName = request.EmergencyContactName?.Trim(),
                EmergencyContactPhone = request.EmergencyContactPhone?.Trim(),
                EmergencyContactRelation = request.EmergencyContactRelation?.Trim(),
                DepartmentId = request.DepartmentId,
                DesignationId = request.DesignationId,
                ReportingToId = request.ReportingToId,
                BranchId = request.BranchId,
                JoinDate = request.JoinDate,
                EmploymentType = request.EmploymentType,
                EmploymentStatus = EmploymentStatus.Active,
                BasicSalary = request.BasicSalary,
                Currency = request.Currency?.Trim().ToUpper() ?? "AED",
                BankName = request.BankName?.Trim(),
                AccountNumber = request.AccountNumber?.Trim(),
                Iban = request.Iban?.Trim(),
                UserId = linkedUserId
            };

            _db.Set<Employee>().Add(employee);
            try
            {
                await _db.SaveChangesAsync(ct);
                var dto = await employee.ToDtoAsync(_db, _tenant, ct);
                return ApiResponse<EmployeeDto>.Ok(dto, "Employee created.");
            }
            catch (DbUpdateException) when (attempt < 4)
            {
                // Likely an EmployeeCode collision — detach and retry with the next code.
                _db.Set<Employee>().Remove(employee);
            }
        }
    }
}
