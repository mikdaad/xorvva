using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Modules.Auth.Commands.LoginUser;
using Xorva.Modules.Auth.Commands.RefreshToken;
using Xorva.Modules.Auth.Commands.RegisterUser;
using Xorva.Modules.Auth.Commands.SetUserActive;
using Xorva.Modules.Auth.DTOs;
using Xorva.Modules.Auth.Queries.GetCurrentUser;
using Xorva.Modules.Auth.Queries.GetUsersByRole;

namespace Xorva.API.Controllers;

/// <summary>
/// Authentication and user management controller.
/// This is a THIN controller — it only routes HTTP requests to MediatR handlers.
/// ALL business logic lives in the command/query handlers, NOT here.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IMediator _mediator;

    public AuthController(IMediator mediator)
    {
        _mediator = mediator;
    }

    /// <summary>Create a new user. Manager and above (role hierarchy in the handler still blocks
    /// creating an equal/higher role, so a Manager can only create Employees).</summary>
    [HttpPost("register")]
    [Authorize]
    [RequireRole(SystemRole.Manager)]
    [ProducesResponseType(typeof(ApiResponse<UserDto>), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Register([FromBody] RegisterUserCommand command)
    {
        var result = await _mediator.Send(command);
        return StatusCode(StatusCodes.Status201Created, result);
    }

    /// <summary>Authenticate and receive JWT tokens.</summary>
    [HttpPost("login")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(ApiResponse<AuthResponseDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Login([FromBody] LoginUserCommand command)
    {
        var result = await _mediator.Send(command);
        return Ok(result);
    }

    /// <summary>Refresh expired access token using a valid refresh token.</summary>
    [HttpPost("refresh")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(ApiResponse<AuthResponseDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Refresh([FromBody] RefreshTokenCommand command)
    {
        var result = await _mediator.Send(command);
        return Ok(result);
    }

    /// <summary>Get the current authenticated user's profile.</summary>
    [HttpGet("me")]
    [Authorize]
    [ProducesResponseType(typeof(ApiResponse<UserDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetCurrentUser()
    {
        var result = await _mediator.Send(new GetCurrentUserQuery());
        return Ok(result);
    }

    /// <summary>List users with optional role filter and pagination. Scoped by caller's role.</summary>
    [HttpGet("/api/users")]
    [Authorize]
    [RequireRole(SystemRole.Manager)]
    [ProducesResponseType(typeof(ApiResponse<PagedResult<UserDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetUsers(
        [FromQuery] SystemRole? role,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? search = null)
    {
        var result = await _mediator.Send(new GetUsersByRoleQuery
        {
            Role = role,
            Page = page,
            PageSize = pageSize,
            Search = search
        });
        return Ok(result);
    }

    /// <summary>Activate or deactivate a user's login. CompanyAdmin and above, within reach and below own rank.</summary>
    [HttpPut("/api/users/{id:guid}/active")]
    [Authorize]
    [RequireRole(SystemRole.CompanyAdmin)]
    [ProducesResponseType(typeof(ApiResponse<UserDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> SetUserActive(Guid id, [FromBody] SetUserActiveCommand command)
        => Ok(await _mediator.Send(command with { UserId = id }));
}
