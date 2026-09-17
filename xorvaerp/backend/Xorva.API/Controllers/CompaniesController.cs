using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Modules.Tenants.Commands.CreateCompany;
using Xorva.Modules.Tenants.Commands.SetCompanyModules;
using Xorva.Modules.Tenants.Commands.UpdateCompanySettings;
using Xorva.Modules.Tenants.DTOs;
using Xorva.Modules.Tenants.Queries.ListCompanies;

namespace Xorva.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class CompaniesController : ControllerBase
{
    private readonly IMediator _mediator;

    public CompaniesController(IMediator mediator)
    {
        _mediator = mediator;
    }

    /// <summary>List companies. SuperAdmin sees all in tenant; others see their own.</summary>
    [HttpGet]
    [RequireRole(SystemRole.Manager)]
    [ProducesResponseType(typeof(ApiResponse<List<CompanyDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> List()
    {
        var result = await _mediator.Send(new ListCompaniesQuery());
        return Ok(result);
    }

    /// <summary>Create a new company. SuperAdmin (CEO) only.</summary>
    [HttpPost]
    [RequireRole(SystemRole.SuperAdmin)]
    [ProducesResponseType(typeof(ApiResponse<CompanyDto>), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Create([FromBody] CreateCompanyCommand command)
    {
        var result = await _mediator.Send(command);
        return StatusCode(StatusCodes.Status201Created, result);
    }

    /// <summary>Update company profile (name, currency, timezone). CompanyAdmin: own company; SuperAdmin: any.</summary>
    [HttpPut("{id:guid}/settings")]
    [RequireRole(SystemRole.CompanyAdmin)]
    [ProducesResponseType(typeof(ApiResponse<CompanyDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpdateSettings(Guid id, [FromBody] UpdateCompanySettingsCommand command)
    {
        var result = await _mediator.Send(command with { CompanyId = id });
        return Ok(result);
    }

    /// <summary>Replace the company's active module set. SuperAdmin only (subscription-level decision).</summary>
    [HttpPut("{id:guid}/modules")]
    [RequireRole(SystemRole.SuperAdmin)]
    [ProducesResponseType(typeof(ApiResponse<CompanyDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> SetModules(Guid id, [FromBody] SetCompanyModulesCommand command)
    {
        var result = await _mediator.Send(command with { CompanyId = id });
        return Ok(result);
    }
}
