using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Enums;
using Xorva.Modules.HR.Commands.CreateDesignation;
using Xorva.Modules.HR.Commands.DeleteDesignation;
using Xorva.Modules.HR.Commands.UpdateDesignation;
using Xorva.Modules.HR.Queries.ListDesignations;

namespace Xorva.API.Controllers;

[ApiController]
[Route("api/designations")]
[Authorize]
public class DesignationsController : ControllerBase
{
    private readonly IMediator _mediator;
    public DesignationsController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    [RequireRole(SystemRole.Employee)]
    public async Task<IActionResult> List([FromQuery] bool includeInactive = false)
        => Ok(await _mediator.Send(new ListDesignationsQuery { IncludeInactive = includeInactive }));

    [HttpPost]
    [RequireRole(SystemRole.CompanyAdmin)]
    public async Task<IActionResult> Create([FromBody] CreateDesignationCommand command)
        => StatusCode(StatusCodes.Status201Created, await _mediator.Send(command));

    [HttpPut("{id:guid}")]
    [RequireRole(SystemRole.CompanyAdmin)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateDesignationCommand command)
        => Ok(await _mediator.Send(command with { Id = id }));

    [HttpDelete("{id:guid}")]
    [RequireRole(SystemRole.CompanyAdmin)]
    public async Task<IActionResult> Delete(Guid id)
        => Ok(await _mediator.Send(new DeleteDesignationCommand(id)));
}
