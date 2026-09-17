using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Sales.Entities;

namespace Xorva.Modules.Accounting.Sales.Queries.ListProducts;

public record ListProductsQuery : IRequest<ApiResponse<List<ProductDto>>>
{
    public Guid? CompanyId { get; init; }
    public bool IncludeInactive { get; init; }
}

public class ListProductsHandler : IRequestHandler<ListProductsQuery, ApiResponse<List<ProductDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public ListProductsHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<ProductDto>>> Handle(ListProductsQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var query = _db.Set<Product>().Where(p => p.CompanyId == companyId);
        if (!request.IncludeInactive)
            query = query.Where(p => p.IsActive);

        var products = await query.OrderBy(p => p.Name).ToListAsync(ct);
        return ApiResponse<List<ProductDto>>.Ok([.. products.Select(p => p.ToDto())]);
    }
}
