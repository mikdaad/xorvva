using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Modules.Tenants.Commands.CreateBranch;
using Xorva.Modules.Tenants.DTOs;
using Xorva.Modules.Tenants.Queries.ListBranches;

namespace Xorva.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class BranchesController : ControllerBase
{
    private readonly IMediator _mediator;

    public BranchesController(IMediator mediator)
    {
        _mediator = mediator;
    }

    /// <summary>List branches visible to the caller (company-scoped filter applies).</summary>
    [HttpGet]
    [RequireRole(SystemRole.Manager)]
    [ProducesResponseType(typeof(ApiResponse<List<BranchDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> List([FromQuery] Guid? companyId)
    {
        var result = await _mediator.Send(new ListBranchesQuery { CompanyId = companyId });
        return Ok(result);
    }

    /// <summary>Create a branch. CompanyAdmin (own company) or SuperAdmin (any company in tenant).</summary>
    [HttpPost]
    [RequireRole(SystemRole.CompanyAdmin)]
    [ProducesResponseType(typeof(ApiResponse<BranchDto>), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Create([FromBody] CreateBranchCommand command)
    {
        var result = await _mediator.Send(command);
        return StatusCode(StatusCodes.Status201Created, result);
    }
}
