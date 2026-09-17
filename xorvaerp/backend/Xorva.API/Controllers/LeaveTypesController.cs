using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Enums;
using Xorva.Modules.HR.Commands.LeaveTypes;
using Xorva.Modules.HR.Commands.SeedLeaveTypes;

namespace Xorva.API.Controllers;

[ApiController]
[Route("api/leave-types")]
[Authorize]
public class LeaveTypesController : ControllerBase
{
    private readonly IMediator _mediator;
    public LeaveTypesController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    [RequireRole(SystemRole.Employee)]
    public async Task<IActionResult> List([FromQuery] bool includeInactive = false)
        => Ok(await _mediator.Send(new ListLeaveTypesQuery(includeInactive)));

    [HttpPost]
    [RequireRole(SystemRole.CompanyAdmin)]
    public async Task<IActionResult> Create([FromBody] CreateLeaveTypeCommand command)
        => StatusCode(StatusCodes.Status201Created, await _mediator.Send(command));

    /// <summary>Seed the standard leave types (Annual, Sick, Unpaid, Maternity, Emergency).</summary>
    [HttpPost("seed-defaults")]
    [RequireRole(SystemRole.CompanyAdmin)]
    public async Task<IActionResult> SeedDefaults([FromBody] SeedLeaveTypesCommand command)
        => Ok(await _mediator.Send(command));

    [HttpPut("{id:guid}")]
    [RequireRole(SystemRole.CompanyAdmin)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateLeaveTypeCommand command)
        => Ok(await _mediator.Send(command with { Id = id }));

    [HttpDelete("{id:guid}")]
    [RequireRole(SystemRole.CompanyAdmin)]
    public async Task<IActionResult> Delete(Guid id)
        => Ok(await _mediator.Send(new DeleteLeaveTypeCommand(id)));
}
