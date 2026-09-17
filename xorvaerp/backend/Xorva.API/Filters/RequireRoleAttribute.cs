using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Xorva.Core.Common;
using Xorva.Core.Enums;

namespace Xorva.API.Filters;

/// <summary>
/// Authorization filter that enforces role-based access control on controller actions.
/// 
/// Usage: [RequireRole(SystemRole.CompanyAdmin)]
/// This means: CompanyAdmin (2) and any role with LOWER numeric value (higher privilege) can access.
/// SystemAdmin (0) and SuperAdmin (1) would pass. Manager (3) and Employee (4) would be blocked.
/// 
/// The role comparison: userRole <= requiredRole
/// Lower enum value = higher privilege level.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = false)]
public class RequireRoleAttribute : Attribute, IAuthorizationFilter
{
    private readonly SystemRole _minimumRole;

    /// <param name="minimumRole">The minimum role required. Users with this role or higher privilege can access.</param>
    public RequireRoleAttribute(SystemRole minimumRole)
    {
        _minimumRole = minimumRole;
    }

    public void OnAuthorization(AuthorizationFilterContext context)
    {
        var user = context.HttpContext.User;

        if (user.Identity?.IsAuthenticated != true)
        {
            context.Result = new UnauthorizedObjectResult(
                ApiResponse.Fail("Authentication required."));
            return;
        }

        var roleValueClaim = user.FindFirst("role_value");
        if (roleValueClaim is null || !int.TryParse(roleValueClaim.Value, out var roleValue))
        {
            context.Result = new ObjectResult(ApiResponse.Fail("Invalid role in token."))
            {
                StatusCode = StatusCodes.Status403Forbidden
            };
            return;
        }

        var userRole = (SystemRole)roleValue;

        // Lower enum value = higher privilege
        // userRole <= _minimumRole means user has sufficient or higher privilege
        if (userRole > _minimumRole)
        {
            context.Result = new ObjectResult(
                ApiResponse.Fail($"This action requires {_minimumRole} role or higher."))
            {
                StatusCode = StatusCodes.Status403Forbidden
            };
        }
    }
}
