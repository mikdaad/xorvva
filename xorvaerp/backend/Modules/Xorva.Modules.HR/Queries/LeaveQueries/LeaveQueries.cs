using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Common;
using Xorva.Modules.HR.DTOs;
using Xorva.Modules.HR.Entities;

namespace Xorva.Modules.HR.Queries.LeaveQueries;

// ─── My leave balance (current year) ────────────────────────────

public record GetLeaveBalanceQuery : IRequest<ApiResponse<List<LeaveBalanceDto>>>;

public class GetLeaveBalanceQueryHandler : IRequestHandler<GetLeaveBalanceQuery, ApiResponse<List<LeaveBalanceDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public GetLeaveBalanceQueryHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<LeaveBalanceDto>>> Handle(GetLeaveBalanceQuery request, CancellationToken ct)
    {
        var employee = await LeaveHelpers.ResolveEmployeeAsync(_db, _tenant, null, ct);
        var year = DateTime.UtcNow.Year;

        var types = await _db.Set<LeaveType>().Where(t => t.IsActive).OrderBy(t => t.Name).ToListAsync(ct);
        var allocations = await _db.Set<LeaveAllocation>()
            .Where(a => a.EmployeeId == employee.Id && a.Year == year).ToListAsync(ct);

        var balances = types.Select(t =>
        {
            var alloc = allocations.FirstOrDefault(a => a.LeaveTypeId == t.Id);
            var total = alloc?.TotalDays ?? t.DefaultDays;
            var used = alloc?.UsedDays ?? 0;
            return new LeaveBalanceDto
            {
                LeaveTypeId = t.Id,
                LeaveTypeName = t.Name,
                LeaveTypeCode = t.Code,
                Year = year,
                TotalDays = total,
                UsedDays = used,
                RemainingDays = total - used,
                IsPaid = t.IsPaid
            };
        }).ToList();

        return ApiResponse<List<LeaveBalanceDto>>.Ok(balances);
    }
}

// ─── My leave requests ──────────────────────────────────────────

public record GetMyLeavesQuery : IRequest<ApiResponse<List<LeaveRequestDto>>>;

public class GetMyLeavesQueryHandler : IRequestHandler<GetMyLeavesQuery, ApiResponse<List<LeaveRequestDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public GetMyLeavesQueryHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<LeaveRequestDto>>> Handle(GetMyLeavesQuery request, CancellationToken ct)
    {
        var employee = await LeaveHelpers.ResolveEmployeeAsync(_db, _tenant, null, ct);
        var leaves = await Project(_db, _db.Set<LeaveRequest>().Where(r => r.EmployeeId == employee.Id), ct);
        return ApiResponse<List<LeaveRequestDto>>.Ok(leaves);
    }

    internal static async Task<List<LeaveRequestDto>> Project(
        IXorvaDbContext db, IQueryable<LeaveRequest> query, CancellationToken ct) =>
        await query.OrderByDescending(r => r.FromDate)
            .Select(r => new LeaveRequestDto
            {
                Id = r.Id,
                EmployeeId = r.EmployeeId,
                EmployeeName = db.Set<Employee>().Where(e => e.Id == r.EmployeeId)
                    .Select(e => e.FirstName + " " + e.LastName).FirstOrDefault(),
                LeaveTypeId = r.LeaveTypeId,
                LeaveTypeName = db.Set<LeaveType>().Where(t => t.Id == r.LeaveTypeId).Select(t => t.Name).FirstOrDefault(),
                FromDate = r.FromDate,
                ToDate = r.ToDate,
                TotalDays = r.TotalDays,
                Reason = r.Reason,
                Status = r.Status,
                RejectionReason = r.RejectionReason,
                CreatedAt = r.CreatedAt
            })
            .ToListAsync(ct);
}

// ─── Team / company leaves ──────────────────────────────────────

public record ListTeamLeavesQuery : IRequest<ApiResponse<List<LeaveRequestDto>>>;

public class ListTeamLeavesQueryHandler : IRequestHandler<ListTeamLeavesQuery, ApiResponse<List<LeaveRequestDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public ListTeamLeavesQueryHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<LeaveRequestDto>>> Handle(ListTeamLeavesQuery request, CancellationToken ct)
    {
        var query = _db.Set<LeaveRequest>().AsQueryable();

        // Manager: only their department's employees' leaves.
        if (_tenant.Role == SystemRole.Manager)
        {
            var deptId = await HrGuard.GetCallerDepartmentIdAsync(_db, _tenant, ct);
            var empIds = _db.Set<Employee>().Where(e => e.DepartmentId == deptId).Select(e => e.Id);
            query = query.Where(r => empIds.Contains(r.EmployeeId));
        }

        var leaves = await GetMyLeavesQueryHandler.Project(_db, query, ct);
        return ApiResponse<List<LeaveRequestDto>>.Ok(leaves);
    }
}
