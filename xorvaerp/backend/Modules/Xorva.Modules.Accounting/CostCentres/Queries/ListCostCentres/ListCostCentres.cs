using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.CostCentres.Entities;
using Xorva.Modules.Accounting.DTOs;

namespace Xorva.Modules.Accounting.CostCentres.Queries.ListCostCentres;

public record ListCostCentreDimensionsQuery : IRequest<ApiResponse<List<CostCentreDimensionDto>>>
{
    public Guid? CompanyId { get; init; }
    public bool IncludeInactive { get; init; }
}

public class ListCostCentreDimensionsHandler : IRequestHandler<ListCostCentreDimensionsQuery, ApiResponse<List<CostCentreDimensionDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public ListCostCentreDimensionsHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<CostCentreDimensionDto>>> Handle(ListCostCentreDimensionsQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        var dims = await _db.Set<CostCentreDimension>().AsNoTracking()
            .Where(d => d.CompanyId == companyId && (request.IncludeInactive || d.IsActive))
            .OrderBy(d => d.SortOrder).ThenBy(d => d.Name)
            .ToListAsync(ct);
        var counts = await _db.Set<CostCentre>().AsNoTracking()
            .Where(c => c.CompanyId == companyId)
            .GroupBy(c => c.DimensionId).Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.Key, g => g.Count, ct);
        return ApiResponse<List<CostCentreDimensionDto>>.Ok([.. dims.Select(d => d.ToDto(counts.GetValueOrDefault(d.Id)))]);
    }
}

/// <summary>Cost centres of a company, optionally one dimension, ordered as a tree (dimension → level → code).</summary>
public record ListCostCentresQuery : IRequest<ApiResponse<List<CostCentreDto>>>
{
    public Guid? CompanyId { get; init; }
    public Guid? DimensionId { get; init; }
    public bool IncludeInactive { get; init; }
    /// <summary>Only posting (non-group) nodes — what the voucher grid's picker needs.</summary>
    public bool LeavesOnly { get; init; }
}

public class ListCostCentresHandler : IRequestHandler<ListCostCentresQuery, ApiResponse<List<CostCentreDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public ListCostCentresHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<CostCentreDto>>> Handle(ListCostCentresQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        var dims = await _db.Set<CostCentreDimension>().AsNoTracking()
            .Where(d => d.CompanyId == companyId).ToDictionaryAsync(d => d.Id, d => d.Name, ct);

        var query = _db.Set<CostCentre>().AsNoTracking().Where(c => c.CompanyId == companyId);
        if (request.DimensionId is { } dim) query = query.Where(c => c.DimensionId == dim);
        if (!request.IncludeInactive) query = query.Where(c => c.IsActive);
        if (request.LeavesOnly) query = query.Where(c => !c.IsGroup);

        var rows = await query.OrderBy(c => c.DimensionId).ThenBy(c => c.Level).ThenBy(c => c.Code).ToListAsync(ct);
        return ApiResponse<List<CostCentreDto>>.Ok([.. rows.Select(c => c.ToDto(dims.GetValueOrDefault(c.DimensionId)))]);
    }
}
