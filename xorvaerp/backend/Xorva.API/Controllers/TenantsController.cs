using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Modules.Tenants.Commands.CompleteOnboarding;
using Xorva.Modules.Tenants.Commands.RegisterTenant;
using Xorva.Modules.Tenants.DTOs;
using Xorva.Modules.Tenants.Queries.GetCurrentTenant;

namespace Xorva.API.Controllers;

/// <summary>
/// Tenant lifecycle. Thin controller — routes HTTP to MediatR only.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class TenantsController : ControllerBase
{
    private readonly IMediator _mediator;

    public TenantsController(IMediator mediator)
    {
        _mediator = mediator;
    }

    /// <summary>
    /// PUBLIC SaaS signup: creates Tenant + first Company + SuperAdmin atomically.
    /// The only anonymous write endpoint in the platform.
    /// </summary>
    [HttpPost("register")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(ApiResponse<TenantSignupResultDto>), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Register([FromBody] RegisterTenantCommand command)
    {
        var result = await _mediator.Send(command);
        return StatusCode(StatusCodes.Status201Created, result);
    }

    /// <summary>Current tenant details (name, contact, company count, onboarding state).</summary>
    [HttpGet("current")]
    [Authorize]
    [RequireRole(SystemRole.Manager)]
    [ProducesResponseType(typeof(ApiResponse<TenantDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCurrent()
    {
        var result = await _mediator.Send(new GetCurrentTenantQuery());
        return Ok(result);
    }

    /// <summary>Marks onboarding complete (CEO finishes/skips the first-login wizard).</summary>
    [HttpPost("complete-onboarding")]
    [Authorize]
    [RequireRole(SystemRole.SuperAdmin)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> CompleteOnboarding()
    {
        var result = await _mediator.Send(new CompleteOnboardingCommand());
        return Ok(result);
    }
}
