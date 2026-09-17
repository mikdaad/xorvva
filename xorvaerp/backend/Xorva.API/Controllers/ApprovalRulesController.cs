using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Modules.Approvals.Commands.CreateRule;
using Xorva.Modules.Approvals.Commands.DeleteRule;
using Xorva.Modules.Approvals.Commands.UpdateRule;
using Xorva.Modules.Approvals.DTOs;
using Xorva.Modules.Approvals.Queries.GetRegistry;
using Xorva.Modules.Approvals.Queries.ListRules;

namespace Xorva.API.Controllers;

/// <summary>
/// Manage approval rules. CompanyAdmin and above (CompanyAdmin own company only;
/// CEO any company + Mandatory flag). Thin controller → MediatR.
/// </summary>
[ApiController]
[Route("api/approval-rules")]
[Authorize]
[RequireRole(SystemRole.CompanyAdmin)]
public class ApprovalRulesController : ControllerBase
{
    private readonly IMediator _mediator;

    public ApprovalRulesController(IMediator mediator)
    {
        _mediator = mediator;
    }

    /// <summary>Dynamic module/action catalog for a company (rule-builder dropdowns).</summary>
    [HttpGet("registry")]
    [ProducesResponseType(typeof(ApiResponse<List<ModuleActionsDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Registry([FromQuery] Guid companyId)
        => Ok(await _mediator.Send(new GetRegistryQuery { CompanyId = companyId }));

    /// <summary>List rules the caller can see (optionally filtered by company).</summary>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<List<ApprovalRuleDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> List([FromQuery] Guid? companyId)
        => Ok(await _mediator.Send(new ListRulesQuery { CompanyId = companyId }));

    /// <summary>Create a rule.</summary>
    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<ApprovalRuleDto>), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Create([FromBody] CreateRuleCommand command)
        => StatusCode(StatusCodes.Status201Created, await _mediator.Send(command));

    /// <summary>Update a rule.</summary>
    [HttpPut("{id:guid}")]
    [ProducesResponseType(typeof(ApiResponse<ApprovalRuleDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateRuleCommand command)
        => Ok(await _mediator.Send(command with { RuleId = id }));

    /// <summary>Delete a rule.</summary>
    [HttpDelete("{id:guid}")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Delete(Guid id)
        => Ok(await _mediator.Send(new DeleteRuleCommand(id)));
}
