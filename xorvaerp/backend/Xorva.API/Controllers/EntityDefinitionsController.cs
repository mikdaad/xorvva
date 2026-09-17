using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Enums;
using Xorva.Modules.Platform.Commands.CreateEntityDefinition;
using Xorva.Modules.Platform.Queries.GetEntityDefinition;
using Xorva.Modules.Platform.Queries.ListEntityDefinitions;

namespace Xorva.API.Controllers;

/// <summary>
/// The "designer" side of the dynamic engine: define custom sub-modules and their fields.
/// Designing is Admin / SuperAdmin only; reading the definitions is open to any user so the
/// dynamic form/list can render.
/// </summary>
[ApiController]
[Route("api/platform/entity-definitions")]
[Authorize]
public class EntityDefinitionsController : ControllerBase
{
    private readonly IMediator _mediator;
    public EntityDefinitionsController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? moduleKey = null, [FromQuery] string? attachTo = null, [FromQuery] bool includeInactive = false)
        => Ok(await _mediator.Send(new ListEntityDefinitionsQuery(moduleKey, attachTo, includeInactive)));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
        => Ok(await _mediator.Send(new GetEntityDefinitionQuery(id)));

    [HttpPost]
    [RequireRole(SystemRole.CompanyAdmin)]
    public async Task<IActionResult> Create([FromBody] CreateEntityDefinitionCommand command)
        => StatusCode(StatusCodes.Status201Created, await _mediator.Send(command));
}
