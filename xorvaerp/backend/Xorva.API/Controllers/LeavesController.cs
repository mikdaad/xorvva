using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Enums;
using Xorva.Modules.HR.Commands.ApplyLeave;
using Xorva.Modules.HR.Commands.CancelLeave;
using Xorva.Modules.HR.Queries.LeaveQueries;

namespace Xorva.API.Controllers;

[ApiController]
[Route("api/leaves")]
[Authorize]
public class LeavesController : ControllerBase
{
    private readonly IMediator _mediator;
    public LeavesController(IMediator mediator) => _mediator = mediator;

    /// <summary>Apply for leave (approvable: Leave Request). Any authenticated employee.</summary>
    [HttpPost]
    [RequireRole(SystemRole.Employee)]
    public async Task<IActionResult> Apply([FromBody] ApplyLeaveCommand command)
        => StatusCode(StatusCodes.Status201Created, await _mediator.Send(command));

    /// <summary>My leave requests.</summary>
    [HttpGet("me")]
    [RequireRole(SystemRole.Employee)]
    public async Task<IActionResult> Mine() => Ok(await _mediator.Send(new GetMyLeavesQuery()));

    /// <summary>My leave balances for the current year.</summary>
    [HttpGet("balance")]
    [RequireRole(SystemRole.Employee)]
    public async Task<IActionResult> Balance() => Ok(await _mediator.Send(new GetLeaveBalanceQuery()));

    /// <summary>Team/company leaves. Manager: own department; CompanyAdmin+: company.</summary>
    [HttpGet]
    [RequireRole(SystemRole.Manager)]
    public async Task<IActionResult> List() => Ok(await _mediator.Send(new ListTeamLeavesQuery()));

    /// <summary>Cancel a leave (owner or CompanyAdmin+).</summary>
    [HttpPut("{id:guid}/cancel")]
    [RequireRole(SystemRole.Employee)]
    public async Task<IActionResult> Cancel(Guid id) => Ok(await _mediator.Send(new CancelLeaveCommand(id)));
}
