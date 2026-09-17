using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Approvals;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Common;
using Xorva.Modules.HR.DTOs;
using Xorva.Modules.HR.Entities;

namespace Xorva.Modules.HR.Commands.ChangeEmployeeSalary;

/// <summary>
/// Changes an employee's salary. Approvable ("Salary Change") and audited to
/// EmployeeHistory. Separate from profile update so only salary edits trigger approval.
/// </summary>
public record ChangeEmployeeSalaryCommand : IRequest<ApiResponse<EmployeeDto>>, IApprovableAction
{
    public Guid Id { get; init; }
    public Guid? CompanyId { get; init; }   // for approval routing (target company)
    public decimal NewSalary { get; init; }
    public string? Reason { get; init; }

    public const string ActionKey = "HR.SalaryChange";
    public string ApprovalActionKey => ActionKey;
    public string ApprovalSummary => $"Salary change to {NewSalary:N2}";
    public Guid? ApprovalCompanyId => CompanyId;
}

public class ChangeEmployeeSalaryValidator : AbstractValidator<ChangeEmployeeSalaryCommand>
{
    public ChangeEmployeeSalaryValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.NewSalary).GreaterThanOrEqualTo(0).WithMessage("Salary cannot be negative.");
    }
}

public class ChangeEmployeeSalaryCommandHandler
    : IRequestHandler<ChangeEmployeeSalaryCommand, ApiResponse<EmployeeDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public ChangeEmployeeSalaryCommandHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<EmployeeDto>> Handle(ChangeEmployeeSalaryCommand request, CancellationToken ct)
    {
        var employee = await _db.Set<Employee>().FirstOrDefaultAsync(e => e.Id == request.Id, ct)
            ?? throw new NotFoundException("Employee", request.Id);

        var oldSalary = employee.BasicSalary;
        employee.BasicSalary = request.NewSalary;

        _db.Set<EmployeeHistory>().Add(new EmployeeHistory
        {
            TenantId = employee.TenantId,
            CompanyId = employee.CompanyId,
            EmployeeId = employee.Id,
            ChangeType = "Salary",
            OldValue = oldSalary.ToString("N2"),
            NewValue = request.NewSalary.ToString("N2"),
            ChangedByUserId = _tenant.UserId,
            ChangedByEmail = _tenant.Email,
            Reason = request.Reason
        });

        await _db.SaveChangesAsync(ct);
        var dto = await employee.ToDtoAsync(_db, _tenant, ct);
        return ApiResponse<EmployeeDto>.Ok(dto, "Salary updated.");
    }
}
