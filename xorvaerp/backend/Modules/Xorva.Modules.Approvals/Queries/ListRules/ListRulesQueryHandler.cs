using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Infrastructure.Data;
using Xorva.Modules.Approvals.Common;
using Xorva.Modules.Approvals.DTOs;

namespace Xorva.Modules.Approvals.Queries.ListRules;

public class ListRulesQueryHandler : IRequestHandler<ListRulesQuery, ApiResponse<List<ApprovalRuleDto>>>
{
    private readonly XorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public ListRulesQueryHandler(XorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<ApprovalRuleDto>>> Handle(
        ListRulesQuery request, CancellationToken cancellationToken)
    {
        // ApprovalRule is CompanyEntity → the global filter already confines
        // non-SuperAdmins to their own company and everyone to their tenant.
        var query = _db.ApprovalRules.AsQueryable();

        if (request.CompanyId.HasValue)
            query = query.Where(r => r.CompanyId == request.CompanyId.Value);

        var rules = await query.OrderBy(r => r.Module).ThenBy(r => r.Name).ToListAsync(cancellationToken);

        var dtos = rules
            .Select(r => r.ToDto(ApprovalRuleGuards.IsReadOnlyTo(_tenant, r)))
            .ToList();

        return ApiResponse<List<ApprovalRuleDto>>.Ok(dtos);
    }
}
