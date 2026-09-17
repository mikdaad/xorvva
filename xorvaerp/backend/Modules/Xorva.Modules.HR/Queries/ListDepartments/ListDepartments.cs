using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.DTOs;
using Xorva.Modules.HR.Entities;

namespace Xorva.Modules.HR.Queries.ListDepartments;

/// <summary>Lists active departments with employee counts. Company-scoped by the global filter.</summary>
public record ListDepartmentsQuery : IRequest<ApiResponse<List<DepartmentDto>>>
{
    public bool IncludeInactive { get; init; }

    /// <summary>Optional — narrow to a single company (used by the CEO, who spans companies,
    /// to list just the active company's departments). Ignored for single-company callers.</summary>
    public Guid? CompanyId { get; init; }
}

public class ListDepartmentsQueryHandler : IRequestHandler<ListDepartmentsQuery, ApiResponse<List<DepartmentDto>>>
{
    private readonly IXorvaDbContext _db;

    public ListDepartmentsQueryHandler(IXorvaDbContext db)
    {
        _db = db;
    }

    public async Task<ApiResponse<List<DepartmentDto>>> Handle(ListDepartmentsQuery request, CancellationToken ct)
    {
        var query = _db.Set<Department>().AsQueryable();
        if (!request.IncludeInactive)
            query = query.Where(d => d.IsActive);
        if (request.CompanyId.HasValue)
            query = query.Where(d => d.CompanyId == request.CompanyId.Value);

        var departments = await query.OrderBy(d => d.SortOrder).ThenBy(d => d.Name).ToListAsync(ct);

        // Employee counts in one grouped query.
        var deptIds = departments.Select(d => d.Id).ToList();
        var counts = await _db.Set<Employee>()
            .Where(e => deptIds.Contains(e.DepartmentId) && e.IsActive)
            .GroupBy(e => e.DepartmentId)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToListAsync(ct);
        var countMap = counts.ToDictionary(x => x.Key, x => x.Count);

        var dtos = departments
            .Select(d => d.ToDto(countMap.GetValueOrDefault(d.Id, 0)))
            .ToList();

        return ApiResponse<List<DepartmentDto>>.Ok(dtos);
    }
}
