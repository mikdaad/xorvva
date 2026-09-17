using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Common;
using Xorva.Modules.HR.DTOs;
using Xorva.Modules.HR.Entities;
using Xorva.Modules.HR.Enums;

namespace Xorva.Modules.HR.Queries.ListEmployees;

/// <summary>
/// Paginated, filtered employee list. Company-scoped by the global filter; a Manager
/// is further confined to their own department.
/// </summary>
public record ListEmployeesQuery : IRequest<ApiResponse<PagedResult<EmployeeSummaryDto>>>
{
    public int Page { get; init; } = 1;
    public int PageSize { get; init; } = 20;
    public string? Search { get; init; }
    public Guid? DepartmentId { get; init; }
    public Guid? DesignationId { get; init; }
    public EmploymentStatus? Status { get; init; }
    public EmploymentType? EmploymentType { get; init; }
    public bool IncludeInactive { get; init; }
    public string? SortBy { get; init; }    // name | joinDate | code
    public string? SortDir { get; init; }   // asc | desc
}

public class ListEmployeesQueryHandler
    : IRequestHandler<ListEmployeesQuery, ApiResponse<PagedResult<EmployeeSummaryDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public ListEmployeesQueryHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<PagedResult<EmployeeSummaryDto>>> Handle(
        ListEmployeesQuery request, CancellationToken ct)
    {
        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 100);

        var query = _db.Set<Employee>().AsQueryable();

        if (!request.IncludeInactive)
            query = query.Where(e => e.IsActive);

        // Manager: confine to own department.
        if (_tenant.Role == SystemRole.Manager)
        {
            var deptId = await HrGuard.GetCallerDepartmentIdAsync(_db, _tenant, ct);
            query = query.Where(e => deptId != null && e.DepartmentId == deptId);
        }

        if (request.DepartmentId.HasValue)
            query = query.Where(e => e.DepartmentId == request.DepartmentId.Value);
        if (request.DesignationId.HasValue)
            query = query.Where(e => e.DesignationId == request.DesignationId.Value);
        if (request.Status.HasValue)
            query = query.Where(e => e.EmploymentStatus == request.Status.Value);
        if (request.EmploymentType.HasValue)
            query = query.Where(e => e.EmploymentType == request.EmploymentType.Value);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.Trim().ToLower();
            query = query.Where(e =>
                e.FirstName.ToLower().Contains(s) ||
                e.LastName.ToLower().Contains(s) ||
                (e.Email != null && e.Email.ToLower().Contains(s)) ||
                e.EmployeeCode.ToLower().Contains(s));
        }

        var desc = string.Equals(request.SortDir, "desc", StringComparison.OrdinalIgnoreCase);
        query = request.SortBy?.ToLower() switch
        {
            "joindate" => desc ? query.OrderByDescending(e => e.JoinDate) : query.OrderBy(e => e.JoinDate),
            "code" => desc ? query.OrderByDescending(e => e.EmployeeCode) : query.OrderBy(e => e.EmployeeCode),
            _ => desc ? query.OrderByDescending(e => e.FirstName) : query.OrderBy(e => e.FirstName),
        };

        var total = await query.CountAsync(ct);

        // Salary is visible to CompanyAdmin and above (Managers see the roster, not pay).
        var canSeeSalary = (int)_tenant.Role <= (int)SystemRole.CompanyAdmin;

        // Project with related names (correlated subqueries).
        var items = await query
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(e => new EmployeeSummaryDto
            {
                Id = e.Id,
                EmployeeCode = e.EmployeeCode,
                FullName = e.FirstName + " " + e.LastName,
                Email = e.Email,
                DepartmentId = e.DepartmentId,
                DepartmentName = _db.Set<Department>().Where(d => d.Id == e.DepartmentId).Select(d => d.Name).FirstOrDefault(),
                DesignationId = e.DesignationId,
                DesignationTitle = _db.Set<Designation>().Where(d => d.Id == e.DesignationId).Select(d => d.Title).FirstOrDefault(),
                EmploymentStatus = e.EmploymentStatus,
                EmploymentType = e.EmploymentType,
                JoinDate = e.JoinDate,
                BasicSalary = canSeeSalary ? e.BasicSalary : null,
                Currency = e.Currency,
                IsActive = e.IsActive
            })
            .ToListAsync(ct);

        return ApiResponse<PagedResult<EmployeeSummaryDto>>.Ok(
            PagedResult<EmployeeSummaryDto>.Create(items, total, page, pageSize));
    }
}
