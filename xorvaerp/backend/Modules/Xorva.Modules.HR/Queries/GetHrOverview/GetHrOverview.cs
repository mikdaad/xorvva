using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Entities;
using Xorva.Modules.HR.Enums;

namespace Xorva.Modules.HR.Queries.GetHrOverview;

/// <summary>Headline HR figures for the module Overview.</summary>
public record HrOverviewDto
{
    public int EmployeeCount { get; init; }
    public int DepartmentCount { get; init; }
    public int DesignationCount { get; init; }
    public int OnLeaveToday { get; init; }
    public int PendingLeaveCount { get; init; }
}

public record GetHrOverviewQuery : IRequest<ApiResponse<HrOverviewDto>>
{
    public Guid? CompanyId { get; init; }
}

public class GetHrOverviewHandler : IRequestHandler<GetHrOverviewQuery, ApiResponse<HrOverviewDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public GetHrOverviewHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<HrOverviewDto>> Handle(GetHrOverviewQuery request, CancellationToken ct)
    {
        // CEO with no company picked → consolidated (null scope); otherwise a single company.
        Guid? scope = _tenant.HasCrossCompanyAccess ? request.CompanyId : _tenant.CompanyId;
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var dto = new HrOverviewDto
        {
            EmployeeCount = await _db.Set<Employee>()
                .CountAsync(e => (scope == null || e.CompanyId == scope) && e.IsActive, ct),
            DepartmentCount = await _db.Set<Department>()
                .CountAsync(d => scope == null || d.CompanyId == scope, ct),
            DesignationCount = await _db.Set<Designation>()
                .CountAsync(d => scope == null || d.CompanyId == scope, ct),
            OnLeaveToday = await _db.Set<LeaveRequest>()
                .CountAsync(l => (scope == null || l.CompanyId == scope)
                    && l.Status == LeaveStatus.Approved && l.FromDate <= today && l.ToDate >= today, ct),
            PendingLeaveCount = await _db.Set<LeaveRequest>()
                .CountAsync(l => (scope == null || l.CompanyId == scope) && l.Status == LeaveStatus.Pending, ct),
        };

        return ApiResponse<HrOverviewDto>.Ok(dto);
    }
}
