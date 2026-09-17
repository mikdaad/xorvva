using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.DTOs;
using Xorva.Modules.HR.Entities;

namespace Xorva.Modules.HR.Queries.ListDesignations;

public record ListDesignationsQuery : IRequest<ApiResponse<List<DesignationDto>>>
{
    public bool IncludeInactive { get; init; }
}

public class ListDesignationsQueryHandler : IRequestHandler<ListDesignationsQuery, ApiResponse<List<DesignationDto>>>
{
    private readonly IXorvaDbContext _db;

    public ListDesignationsQueryHandler(IXorvaDbContext db)
    {
        _db = db;
    }

    public async Task<ApiResponse<List<DesignationDto>>> Handle(ListDesignationsQuery request, CancellationToken ct)
    {
        var query = _db.Set<Designation>().AsQueryable();
        if (!request.IncludeInactive)
            query = query.Where(d => d.IsActive);

        var list = await query.OrderBy(d => d.Category).ThenBy(d => d.Title).ToListAsync(ct);

        // Headcount per designation (active employees).
        var counts = await _db.Set<Employee>().Where(e => e.IsActive)
            .GroupBy(e => e.DesignationId)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToListAsync(ct);
        var countMap = counts.ToDictionary(c => c.Key, c => c.Count);

        return ApiResponse<List<DesignationDto>>.Ok(
            list.Select(d => d.ToDto(countMap.GetValueOrDefault(d.Id, 0))).ToList());
    }
}
