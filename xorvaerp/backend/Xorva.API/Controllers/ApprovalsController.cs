using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Modules.Approvals.Commands.ApproveRequest;
using Xorva.Modules.Approvals.Commands.RejectRequest;
using Xorva.Modules.Approvals.DTOs;
using Xorva.Modules.Approvals.Queries.ApprovalHistory;
using Xorva.Modules.Approvals.Queries.PendingApprovals;

namespace Xorva.API.Controllers;

/// <summary>
/// The approver-facing side: pending inbox, approve/reject, and the audit history.
/// Manager and above (an Employee never approves).
/// </summary>
[ApiController]
[Route("api/approvals")]
[Authorize]
[RequireRole(SystemRole.Manager)]
public class ApprovalsController : ControllerBase
{
    private readonly IMediator _mediator;

    public ApprovalsController(IMediator mediator)
    {
        _mediator = mediator;
    }

    /// <summary>Items awaiting THIS caller's action.</summary>
    [HttpGet("pending")]
    [ProducesResponseType(typeof(ApiResponse<List<ApprovalRequestDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Pending()
        => Ok(await _mediator.Send(new PendingApprovalsQuery()));

    /// <summary>Full audit trail of requests in the caller's scope.</summary>
    [HttpGet("history")]
    [ProducesResponseType(typeof(ApiResponse<List<ApprovalRequestDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> History()
        => Ok(await _mediator.Send(new ApprovalHistoryQuery()));

    /// <summary>Approve the current step. Final approval executes the captured action.</summary>
    [HttpPost("{id:guid}/approve")]
    [ProducesResponseType(typeof(ApiResponse<ApprovalRequestDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Approve(Guid id, [FromBody] ApproveRequestCommand command)
        => Ok(await _mediator.Send(command with { RequestId = id }));

    /// <summary>Reject the request (terminates the whole chain).</summary>
    [HttpPost("{id:guid}/reject")]
    [ProducesResponseType(typeof(ApiResponse<ApprovalRequestDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Reject(Guid id, [FromBody] RejectRequestCommand command)
        => Ok(await _mediator.Send(command with { RequestId = id }));
}
