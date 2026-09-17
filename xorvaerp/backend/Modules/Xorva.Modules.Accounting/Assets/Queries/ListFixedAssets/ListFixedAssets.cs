using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Assets.Entities;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;

namespace Xorva.Modules.Accounting.Assets.Queries.ListFixedAssets;

public record ListFixedAssetsQuery : IRequest<ApiResponse<List<FixedAssetDto>>>
{
    public Guid? CompanyId { get; init; }
}

public class ListFixedAssetsHandler : IRequestHandler<ListFixedAssetsQuery, ApiResponse<List<FixedAssetDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public ListFixedAssetsHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<FixedAssetDto>>> Handle(ListFixedAssetsQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var assets = await _db.Set<FixedAsset>()
            .Where(a => a.CompanyId == companyId)
            .OrderByDescending(a => a.AcquisitionDate)
            .ToListAsync(ct);

        return ApiResponse<List<FixedAssetDto>>.Ok([.. assets.Select(a => a.ToDto())]);
    }
}
