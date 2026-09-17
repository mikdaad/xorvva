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

namespace Xorva.Modules.HR.Commands.ApplyLeave;

/// <summary>
/// Applies for leave. Approvable ("Leave Request") — when a rule exists the request is
/// queued and this handler runs on approval; otherwise it runs immediately. The handler
/// validates dates/overlap/balance (re-validated on approval), creates the LeaveRequest
/// as Approved, and consumes the allocation. Correctness under concurrency comes from the
/// balance re-check at execution + the allocation concurrency token.
/// </summary>
public record ApplyLeaveCommand : IRequest<ApiResponse<LeaveRequestDto>>, IApprovableAction
{
    /// <summary>Optional — an admin/manager applying on behalf. Default: the caller.</summary>
    public Guid? EmployeeId { get; init; }
    public Guid LeaveTypeId { get; init; }
    public DateOnly FromDate { get; init; }
    public DateOnly ToDate { get; init; }
    public string Reason { get; init; } = string.Empty;
    public string? AttachmentUrl { get; init; }

    public const string ActionKey = "HR.LeaveRequest";
    public string ApprovalActionKey => ActionKey;
    public string ApprovalSummary => $"Leave {FromDate:yyyy-MM-dd} → {ToDate:yyyy-MM-dd}";
    public Guid? ApprovalCompanyId => null; // routes via the caller's company
}

public class ApplyLeaveValidator : AbstractValidator<ApplyLeaveCommand>
{
    public ApplyLeaveValidator(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        RuleFor(x => x.LeaveTypeId).NotEmpty();
        RuleFor(x => x.FromDate).NotEmpty();
        RuleFor(x => x.ToDate).NotEmpty()
            .GreaterThanOrEqualTo(x => x.FromDate).WithMessage("End date must be on or after start date.");
        RuleFor(x => x.Reason).NotEmpty().WithMessage("A reason is required.").MaximumLength(1000);

        // Fail fast (BEFORE the approval engine queues anything): a caller applying for
        // themselves must have a linked employee profile — otherwise the request would be
        // approved and then fail at execution with "no employee profile". This keeps the
        // approval inbox trustworthy: everything queued can actually be carried out.
        RuleFor(x => x)
            .MustAsync((_, ct) => db.Set<Employee>().AnyAsync(e => e.UserId == tenant.UserId, ct))
            .WithMessage("Your account isn't linked to an employee profile, so you can't request leave. " +
                         "Ask an admin to add you under HR → Employees (they can grant you access at the same time).")
            .When(x => !x.EmployeeId.HasValue);
    }
}

public class ApplyLeaveCommandHandler : IRequestHandler<ApplyLeaveCommand, ApiResponse<LeaveRequestDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public ApplyLeaveCommandHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<LeaveRequestDto>> Handle(ApplyLeaveCommand request, CancellationToken ct)
    {
        var employee = await LeaveHelpers.ResolveEmployeeAsync(_db, _tenant, request.EmployeeId, ct);

        var type = await _db.Set<LeaveType>()
            .FirstOrDefaultAsync(t => t.Id == request.LeaveTypeId && t.CompanyId == employee.CompanyId && t.IsActive, ct)
            ?? throw new BadRequestException("Leave type not found for this company.");

        if (request.ToDate < request.FromDate)
            throw new BadRequestException("End date must be on or after start date.");

        // Working days (weekends + holidays excluded).
        var holidays = await LeaveHelpers.HolidaySetAsync(_db, employee.CompanyId, request.FromDate.Year, ct);
        if (request.ToDate.Year != request.FromDate.Year)
            foreach (var d in await LeaveHelpers.HolidaySetAsync(_db, employee.CompanyId, request.ToDate.Year, ct))
                holidays.Add(d);

        var days = LeaveCalculator.WorkingDays(request.FromDate, request.ToDate, holidays);
        if (days <= 0)
            throw new BadRequestException("The selected range contains no working days.");

        // No overlap with existing approved/pending leave for this employee.
        var overlaps = await _db.Set<LeaveRequest>().AnyAsync(r =>
            r.EmployeeId == employee.Id &&
            (r.Status == LeaveStatus.Approved || r.Status == LeaveStatus.Pending) &&
            r.FromDate <= request.ToDate && r.ToDate >= request.FromDate, ct);
        if (overlaps)
            throw new ConflictException("This overlaps an existing leave request.");

        // Balance check (skipped for unlimited types, DefaultDays == 0).
        var year = request.FromDate.Year;
        var allocation = await LeaveHelpers.GetOrCreateAllocationAsync(_db, employee, type, year, ct);
        if (type.DefaultDays > 0 && allocation.RemainingDays < days)
            throw new BadRequestException(
                $"Insufficient balance: {allocation.RemainingDays} day(s) left, {days} requested.");

        var leave = new LeaveRequest
        {
            TenantId = employee.TenantId,
            CompanyId = employee.CompanyId,
            EmployeeId = employee.Id,
            LeaveTypeId = type.Id,
            FromDate = request.FromDate,
            ToDate = request.ToDate,
            TotalDays = days,
            Reason = request.Reason.Trim(),
            AttachmentUrl = request.AttachmentUrl,
            Status = LeaveStatus.Approved // reaching the handler means it's granted (no rule, or approved)
        };
        _db.Set<LeaveRequest>().Add(leave);

        allocation.UsedDays += days;
        allocation.Version++;

        await _db.SaveChangesAsync(ct);

        return ApiResponse<LeaveRequestDto>.Ok(new LeaveRequestDto
        {
            Id = leave.Id,
            EmployeeId = employee.Id,
            EmployeeName = employee.FullName,
            LeaveTypeId = type.Id,
            LeaveTypeName = type.Name,
            FromDate = leave.FromDate,
            ToDate = leave.ToDate,
            TotalDays = days,
            Reason = leave.Reason,
            Status = leave.Status,
            CreatedAt = leave.CreatedAt
        }, "Leave recorded.");
    }
}
