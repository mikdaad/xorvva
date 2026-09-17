using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.Core.Common;
using Xorva.Modules.Approvals.DTOs;
using Xorva.Modules.Approvals.Queries.MyApprovalRequests;

namespace Xorva.API.Controllers;

/// <summary>
/// The requester-facing side of approvals: things I submitted and their status.
/// Available to every authenticated user (an Employee can watch their leave request
/// while it's Pending), unlike the approver inbox which is Manager+.
/// </summary>
[ApiController]
[Route("api/my-requests")]
[Authorize]
public class MyRequestsController : ControllerBase
{
    private readonly IMediator _mediator;

    public MyRequestsController(IMediator mediator)
    {
        _mediator = mediator;
    }

    /// <summary>Approval requests I submitted, newest first. Optional ?actionKey= filter.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<List<ApprovalRequestDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Mine([FromQuery] string? actionKey)
        => Ok(await _mediator.Send(new MyApprovalRequestsQuery { ActionKey = actionKey }));
}
