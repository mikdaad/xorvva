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
using Xorva.Modules.HR.Enums;

namespace Xorva.Modules.HR.Commands.ChangeEmployeeStatus;

/// <summary>
/// Changes employment status. Approvable ("Termination") — a company can require
/// sign-off before someone is resigned/terminated. Audited to EmployeeHistory.
/// Resigned/Terminated also deactivate the employee.
/// </summary>
public record ChangeEmployeeStatusCommand : IRequest<ApiResponse<EmployeeDto>>, IApprovableAction
{
    public Guid Id { get; init; }
    public Guid? CompanyId { get; init; }
    public EmploymentStatus NewStatus { get; init; }
    public string? Reason { get; init; }

    public const string ActionKey = "HR.TerminateEmployee";
    public string ApprovalActionKey => ActionKey;
    public string ApprovalSummary => $"Status change to {NewStatus}";
    public Guid? ApprovalCompanyId => CompanyId;
}

public class ChangeEmployeeStatusValidator : AbstractValidator<ChangeEmployeeStatusCommand>
{
    public ChangeEmployeeStatusValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.NewStatus).IsInEnum();
    }
}

public class ChangeEmployeeStatusCommandHandler
    : IRequestHandler<ChangeEmployeeStatusCommand, ApiResponse<EmployeeDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public ChangeEmployeeStatusCommandHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<EmployeeDto>> Handle(ChangeEmployeeStatusCommand request, CancellationToken ct)
    {
        var employee = await _db.Set<Employee>().FirstOrDefaultAsync(e => e.Id == request.Id, ct)
            ?? throw new NotFoundException("Employee", request.Id);

        var old = employee.EmploymentStatus;
        employee.EmploymentStatus = request.NewStatus;

        // Resigned/Terminated employees are deactivated.
        if (request.NewStatus is EmploymentStatus.Resigned or EmploymentStatus.Terminated)
            employee.IsActive = false;
        else if (request.NewStatus == EmploymentStatus.Active)
            employee.IsActive = true;

        _db.Set<EmployeeHistory>().Add(new EmployeeHistory
        {
            TenantId = employee.TenantId,
            CompanyId = employee.CompanyId,
            EmployeeId = employee.Id,
            ChangeType = "Status",
            OldValue = old.ToString(),
            NewValue = request.NewStatus.ToString(),
            ChangedByUserId = _tenant.UserId,
            ChangedByEmail = _tenant.Email,
            Reason = request.Reason
        });

        await _db.SaveChangesAsync(ct);
        var dto = await employee.ToDtoAsync(_db, _tenant, ct);
        return ApiResponse<EmployeeDto>.Ok(dto, "Employee status updated.");
    }
}
