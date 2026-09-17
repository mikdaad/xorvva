using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Entities;
using Xorva.Modules.HR.Enums;

namespace Xorva.Modules.HR.Commands.CancelLeave;

/// <summary>Cancels an approved/pending leave and returns the days to the allocation.</summary>
public record CancelLeaveCommand(Guid Id) : IRequest<ApiResponse>;

public class CancelLeaveCommandHandler : IRequestHandler<CancelLeaveCommand, ApiResponse>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public CancelLeaveCommandHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse> Handle(CancelLeaveCommand request, CancellationToken ct)
    {
        var leave = await _db.Set<LeaveRequest>().FirstOrDefaultAsync(r => r.Id == request.Id, ct)
            ?? throw new NotFoundException("Leave request", request.Id);

        // The owner may cancel their own; CompanyAdmin+ may cancel anyone's.
        if ((int)_tenant.Role > (int)SystemRole.CompanyAdmin)
        {
            var ownEmployee = await _db.Set<Employee>()
                .AnyAsync(e => e.Id == leave.EmployeeId && e.UserId == _tenant.UserId, ct);
            if (!ownEmployee)
                throw new ForbiddenException("You can only cancel your own leave.");
        }

        if (leave.Status is not (LeaveStatus.Approved or LeaveStatus.Pending))
            throw new BadRequestException($"A {leave.Status} leave cannot be cancelled.");

        // Return the days.
        var allocation = await _db.Set<LeaveAllocation>().FirstOrDefaultAsync(a =>
            a.EmployeeId == leave.EmployeeId && a.LeaveTypeId == leave.LeaveTypeId &&
            a.Year == leave.FromDate.Year, ct);
        if (allocation is not null)
        {
            allocation.UsedDays = Math.Max(0, allocation.UsedDays - leave.TotalDays);
            allocation.Version++;
        }

        leave.Status = LeaveStatus.Cancelled;
        await _db.SaveChangesAsync(ct);
        return ApiResponse.Ok("Leave cancelled.");
    }
}
