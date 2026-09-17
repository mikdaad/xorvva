using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Infrastructure.Data;
using Xorva.Modules.Tenants.DTOs;

namespace Xorva.Modules.Tenants.Queries.ListBranches;

public class ListBranchesQueryHandler : IRequestHandler<ListBranchesQuery, ApiResponse<List<BranchDto>>>
{
    private readonly XorvaDbContext _db;

    public ListBranchesQueryHandler(XorvaDbContext db)
    {
        _db = db;
    }

    public async Task<ApiResponse<List<BranchDto>>> Handle(
        ListBranchesQuery request, CancellationToken cancellationToken)
    {
        // Global CompanyEntity filter already enforces tenant + company scoping
        var query = _db.Branches.AsQueryable();

        if (request.CompanyId.HasValue)
            query = query.Where(b => b.CompanyId == request.CompanyId.Value);

        var branches = await query
            .OrderBy(b => b.CreatedAt)
            .Select(b => b.ToDto())
            .ToListAsync(cancellationToken);

        return ApiResponse<List<BranchDto>>.Ok(branches);
    }
}
