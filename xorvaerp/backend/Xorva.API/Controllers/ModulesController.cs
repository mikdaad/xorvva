using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Infrastructure.Modules;
using Xorva.Modules.Tenants.Commands.SetTenantSubscriptionModules;
using Xorva.Modules.Tenants.Queries.GetTenantSubscription;

namespace Xorva.API.Controllers;

/// <summary>
/// The installed-module catalog + the tenant's module subscription (marketplace). The catalog
/// is generated from the module registry, not a hardcoded list.
/// </summary>
[ApiController]
[Route("api/modules")]
[Authorize]
public class ModulesController : ControllerBase
{
    private readonly ModuleRegistry _registry;
    private readonly IMediator _mediator;
    public ModulesController(ModuleRegistry registry, IMediator mediator)
    {
        _registry = registry;
        _mediator = mediator;
    }

    /// <summary>Lists every installed module with its identity and dependencies.</summary>
    [HttpGet("catalog")]
    public ActionResult<ApiResponse<IEnumerable<ModuleCatalogItem>>> Catalog()
    {
        var items = _registry.Modules.Select(m => new ModuleCatalogItem(
            m.Key, m.DisplayName, m.Description, m.DependsOn, m.IsCore));
        return Ok(ApiResponse<IEnumerable<ModuleCatalogItem>>.Ok(items));
    }

    /// <summary>The tenant's module subscription + the subscribable catalog (marketplace view).</summary>
    [HttpGet("subscription")]
    public async Task<IActionResult> Subscription()
        => Ok(await _mediator.Send(new GetTenantSubscriptionQuery()));

    /// <summary>Set which modules the tenant subscribes to. SuperAdmin (CEO) only.</summary>
    [HttpPut("subscription")]
    [RequireRole(SystemRole.SuperAdmin)]
    public async Task<IActionResult> SetSubscription([FromBody] SetTenantSubscriptionModulesCommand command)
        => Ok(await _mediator.Send(command));
}

/// <summary>A catalog row describing one installed module.</summary>
public sealed record ModuleCatalogItem(
    string Key, string DisplayName, string Description, string[] DependsOn, bool IsCore);
