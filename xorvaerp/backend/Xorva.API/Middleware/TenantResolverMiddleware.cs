using System.Security.Claims;
using Xorva.Core.Enums;
using Xorva.Core.Interfaces;

namespace Xorva.API.Middleware;

/// <summary>
/// Extracts tenant context from the authenticated JWT claims and sets it
/// on the scoped ICurrentTenantService for the current request.
/// 
/// MUST run AFTER Authentication middleware (needs HttpContext.User populated).
/// MUST run BEFORE any controller/handler that uses ICurrentTenantService.
/// 
/// Pipeline position: Authentication → TenantResolver → Authorization → Controllers
/// </summary>
public class TenantResolverMiddleware
{
    private readonly RequestDelegate _next;

    public TenantResolverMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, ICurrentTenantService tenantService)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            var userIdClaim = context.User.FindFirst(ClaimTypes.NameIdentifier)
                              ?? context.User.FindFirst("sub");
            var tenantIdClaim = context.User.FindFirst("tenantId");
            var companyIdClaim = context.User.FindFirst("companyId");
            var roleClaim = context.User.FindFirst("role_value");
            var emailClaim = context.User.FindFirst(ClaimTypes.Email)
                             ?? context.User.FindFirst("email");

            if (userIdClaim is not null && Guid.TryParse(userIdClaim.Value, out var userId))
            {
                var tenantId = tenantIdClaim is not null && Guid.TryParse(tenantIdClaim.Value, out var tid)
                    ? tid : Guid.Empty;

                var companyId = companyIdClaim is not null && Guid.TryParse(companyIdClaim.Value, out var cid)
                    ? cid : Guid.Empty;

                var role = roleClaim is not null && int.TryParse(roleClaim.Value, out var roleValue)
                    ? (SystemRole)roleValue : SystemRole.Employee;

                var email = emailClaim?.Value ?? string.Empty;

                tenantService.SetTenant(userId, tenantId, companyId, role, email);
            }
        }

        await _next(context);
    }
}
