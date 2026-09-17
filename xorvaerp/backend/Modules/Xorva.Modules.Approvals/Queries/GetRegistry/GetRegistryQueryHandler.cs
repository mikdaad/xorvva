using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Approvals;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Infrastructure.Data;
using Xorva.Modules.Approvals.DTOs;

namespace Xorva.Modules.Approvals.Queries.GetRegistry;

public class GetRegistryQueryHandler : IRequestHandler<GetRegistryQuery, ApiResponse<List<ModuleActionsDto>>>
{
    private readonly XorvaDbContext _db;
    private readonly IApprovableActionRegistry _registry;
    private readonly ICurrentTenantService _tenant;

    public GetRegistryQueryHandler(
        XorvaDbContext db, IApprovableActionRegistry registry, ICurrentTenantService tenant)
    {
        _db = db;
        _registry = registry;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<ModuleActionsDto>>> Handle(
        GetRegistryQuery request, CancellationToken cancellationToken)
    {
        // Company must belong to the caller's tenant (filter enforces this).
        var company = await _db.Companies
            .FirstOrDefaultAsync(c => c.Id == request.CompanyId, cancellationToken)
            ?? throw new NotFoundException("Company", request.CompanyId);

        // CompanyAdmin/Manager may only inspect their own company's registry.
        if (!_tenant.HasCrossCompanyAccess && company.Id != _tenant.CompanyId)
            throw new ForbiddenException("You can only view approval settings for your own company.");

        var active = company.ActiveModules;

        var available = _registry.All
            .Where(a => !a.RequiresModuleActivation || active.Contains(a.Module))
            .GroupBy(a => a.Module)
            .OrderBy(g => g.Key)
            .Select(g => new ModuleActionsDto
            {
                Module = g.Key,
                Actions = g.OrderBy(a => a.DisplayName)
                    .Select(a => new ActionDto
                    {
                        ActionKey = a.ActionKey,
                        DisplayName = a.DisplayName,
                        SupportsAmountThreshold = a.SupportsAmountThreshold,
                    })
                    .ToList()
            })
            .ToList();

        return ApiResponse<List<ModuleActionsDto>>.Ok(available);
    }
}
