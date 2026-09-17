using Microsoft.EntityFrameworkCore;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Core.Interfaces;
using Xorva.Infrastructure.Data;
using Xorva.Modules.HR.Entities;

namespace Xorva.API.Dashboard;

/// <summary>
/// Computes the role-shaped dashboard summary server-side. Reads the shared context
/// directly (a dashboard is a cross-cutting presentation aggregation, not a module).
/// </summary>
public class DashboardService
{
    private readonly XorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public DashboardService(XorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<DashboardDto> BuildAsync(CancellationToken ct)
    {
        var role = _tenant.Role;

        // ─── Pending approvals the caller can act on (shared by all approver roles) ───
        var (pendingCount, pendingPreview) = await PendingForCallerAsync(ct);

        var dto = new DashboardDto
        {
            Role = role.ToString(),
            PendingApprovalCount = role <= SystemRole.Manager ? pendingCount : null,
            PendingApprovals = role <= SystemRole.Manager ? pendingPreview : null
        };

        return role switch
        {
            SystemRole.SuperAdmin => dto with
            {
                CompanyCount = await _db.Companies.CountAsync(ct),
                TotalEmployees = await _db.Employees.Where(e => e.IsActive).CountAsync(ct),
                Companies = await CompanySummariesAsync(ct)
            },
            SystemRole.CompanyAdmin => dto with
            {
                EmployeeCount = await _db.Employees.Where(e => e.IsActive).CountAsync(ct),
                DepartmentCount = await _db.Departments.Where(d => d.IsActive).CountAsync(ct),
                OnLeaveToday = await OnLeaveTodayAsync(null, ct),
                RecentHires = await RecentHiresAsync(ct)
            },
            SystemRole.Manager => await ManagerSectionAsync(dto, ct),
            SystemRole.Employee => await EmployeeSectionAsync(dto, ct),
            _ => dto
        };
    }

    // ─── Approvals ──────────────────────────────────────────────

    private async Task<(int Count, List<ApprovalPreviewDto> Preview)> PendingForCallerAsync(CancellationToken ct)
    {
        if (_tenant.Role > SystemRole.Manager)
            return (0, []);

        var pending = await _db.ApprovalRequests
            .Include(r => r.Steps)
            .Where(r => r.Status == ApprovalStatus.Pending)
            .ToListAsync(ct);

        var actionable = pending
            .Where(r => r.RequesterUserId != _tenant.UserId)
            .Select(r => new
            {
                Request = r,
                Current = r.Steps.Where(s => s.Status == ApprovalStepStatus.Pending)
                                 .OrderBy(s => s.Order).FirstOrDefault()
            })
            .Where(x => x.Current is not null && (int)_tenant.Role <= (int)x.Current!.RequiredRole)
            .Select(x => x.Request)
            .OrderBy(r => r.CreatedAt)
            .ToList();

        var preview = actionable.Take(5).Select(r => new ApprovalPreviewDto
        {
            Id = r.Id,
            Title = r.Title,
            RequesterEmail = r.RequesterEmail,
            CreatedAt = r.CreatedAt
        }).ToList();

        return (actionable.Count, preview);
    }

    // ─── CEO ────────────────────────────────────────────────────

    private async Task<List<CompanySummaryDto>> CompanySummariesAsync(CancellationToken ct)
    {
        var companies = await _db.Companies.OrderBy(c => c.Name).ToListAsync(ct);
        var counts = await _db.Employees.Where(e => e.IsActive)
            .GroupBy(e => e.CompanyId).Select(g => new { g.Key, Count = g.Count() }).ToListAsync(ct);
        var map = counts.ToDictionary(x => x.Key, x => x.Count);

        return companies.Select(c => new CompanySummaryDto
        {
            Id = c.Id,
            Name = c.Name,
            EmployeeCount = map.GetValueOrDefault(c.Id, 0),
            Modules = c.ActiveModules
        }).ToList();
    }

    // ─── Company Admin ──────────────────────────────────────────

    private async Task<int> OnLeaveTodayAsync(Guid? departmentId, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var q = _db.LeaveRequests.Where(r =>
            r.Status == Xorva.Modules.HR.Enums.LeaveStatus.Approved &&
            r.FromDate <= today && r.ToDate >= today);

        if (departmentId is not null)
        {
            var empIds = _db.Employees.Where(e => e.DepartmentId == departmentId).Select(e => e.Id);
            q = q.Where(r => empIds.Contains(r.EmployeeId));
        }
        return await q.Select(r => r.EmployeeId).Distinct().CountAsync(ct);
    }

    private async Task<List<HireDto>> RecentHiresAsync(CancellationToken ct)
    {
        var recent = await _db.Employees.Where(e => e.IsActive)
            .OrderByDescending(e => e.CreatedAt).Take(5)
            .Select(e => new { e.FirstName, e.LastName, e.DepartmentId, e.CreatedAt }).ToListAsync(ct);

        var deptIds = recent.Select(r => r.DepartmentId).Distinct().ToList();
        var depts = await _db.Departments.Where(d => deptIds.Contains(d.Id))
            .Select(d => new { d.Id, d.Name }).ToListAsync(ct);
        var deptMap = depts.ToDictionary(d => d.Id, d => d.Name);

        return recent.Select(e => new HireDto
        {
            FullName = $"{e.FirstName} {e.LastName}",
            DepartmentName = deptMap.GetValueOrDefault(e.DepartmentId),
            CreatedAt = e.CreatedAt
        }).ToList();
    }

    // ─── Manager ────────────────────────────────────────────────

    private async Task<DashboardDto> ManagerSectionAsync(DashboardDto dto, CancellationToken ct)
    {
        var deptId = await _db.Users.IgnoreQueryFilters()
            .Where(u => u.Id == _tenant.UserId).Select(u => u.DepartmentId).FirstOrDefaultAsync(ct);

        var teamSize = deptId is null ? 0
            : await _db.Employees.CountAsync(e => e.DepartmentId == deptId && e.IsActive, ct);

        return dto with
        {
            TeamSize = teamSize,
            TeamOnLeave = deptId is null ? 0 : await OnLeaveTodayAsync(deptId, ct)
        };
    }

    // ─── Employee ───────────────────────────────────────────────

    private async Task<DashboardDto> EmployeeSectionAsync(DashboardDto dto, CancellationToken ct)
    {
        var employee = await _db.Employees.FirstOrDefaultAsync(e => e.UserId == _tenant.UserId, ct);
        if (employee is null)
            return dto;

        var deptName = await _db.Departments.Where(d => d.Id == employee.DepartmentId).Select(d => d.Name).FirstOrDefaultAsync(ct);
        var desigTitle = await _db.Designations.Where(d => d.Id == employee.DesignationId).Select(d => d.Title).FirstOrDefaultAsync(ct);

        var year = DateTime.UtcNow.Year;
        var types = await _db.LeaveTypes.Where(t => t.IsActive).OrderBy(t => t.Name).ToListAsync(ct);
        var allocations = await _db.LeaveAllocations
            .Where(a => a.EmployeeId == employee.Id && a.Year == year).ToListAsync(ct);

        var balances = types.Select(t =>
        {
            var alloc = allocations.FirstOrDefault(a => a.LeaveTypeId == t.Id);
            var total = alloc?.TotalDays ?? t.DefaultDays;
            var used = alloc?.UsedDays ?? 0;
            return new LeaveBalanceMiniDto
            {
                LeaveTypeName = t.Name,
                TotalDays = total,
                UsedDays = used,
                RemainingDays = total - used
            };
        }).ToList();

        return dto with
        {
            Profile = new EmployeeMiniDto
            {
                FullName = employee.FullName,
                EmployeeCode = employee.EmployeeCode,
                DepartmentName = deptName,
                DesignationTitle = desigTitle,
                JoinDate = employee.JoinDate
            },
            LeaveBalance = balances
        };
    }

    // ─── SystemAdmin platform overview ──────────────────────────

    public async Task<AdminOverviewDto> BuildAdminOverviewAsync(CancellationToken ct)
    {
        var recent = await _db.Tenants.IgnoreQueryFilters()
            .OrderByDescending(t => t.CreatedAt).Take(10)
            .Select(t => new TenantSignupDto
            {
                Name = t.Name,
                ContactEmail = t.ContactEmail,
                CompanyCount = t.Companies.Count,
                CreatedAt = t.CreatedAt
            }).ToListAsync(ct);

        return new AdminOverviewDto
        {
            TenantCount = await _db.Tenants.IgnoreQueryFilters().CountAsync(ct),
            CompanyCount = await _db.Companies.IgnoreQueryFilters().CountAsync(ct),
            UserCount = await _db.Users.IgnoreQueryFilters().CountAsync(ct),
            EmployeeCount = await _db.Employees.IgnoreQueryFilters().CountAsync(ct),
            RecentSignups = recent
        };
    }
}
