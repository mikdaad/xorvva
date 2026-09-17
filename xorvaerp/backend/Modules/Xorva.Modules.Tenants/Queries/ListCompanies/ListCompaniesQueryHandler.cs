using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Infrastructure.Data;
using Xorva.Modules.Tenants.DTOs;

namespace Xorva.Modules.Tenants.Queries.ListCompanies;

public class ListCompaniesQueryHandler : IRequestHandler<ListCompaniesQuery, ApiResponse<List<CompanyDto>>>
{
    private readonly XorvaDbContext _db;
    private readonly ICurrentTenantService _tenantService;

    public ListCompaniesQueryHandler(XorvaDbContext db, ICurrentTenantService tenantService)
    {
        _db = db;
        _tenantService = tenantService;
    }

    public async Task<ApiResponse<List<CompanyDto>>> Handle(
        ListCompaniesQuery request, CancellationToken cancellationToken)
    {
        // Company is tenant-scoped (a Company row IS the company), so cross-company
        // visibility is decided here, not in the global filter:
        var query = _db.Companies.AsQueryable();

        if (!_tenantService.HasCrossCompanyAccess)
            query = query.Where(c => c.Id == _tenantService.CompanyId);

        var companies = await query
            .OrderBy(c => c.CreatedAt)
            .Select(c => c.ToDto())
            .ToListAsync(cancellationToken);

        return ApiResponse<List<CompanyDto>>.Ok(companies);
    }
}
