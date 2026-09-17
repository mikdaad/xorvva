using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Xorva.Core.Common;

namespace Xorva.API.Filters;

/// <summary>
/// Authorizes Accounting endpoints via the department-function model (see <see cref="AccountingAccess"/>):
/// Company Admin &amp; above, or a Manager who heads an Accounting-function department.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = false)]
public sealed class RequireAccountingAccessAttribute : Attribute, IAsyncAuthorizationFilter
{
    public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        if (context.HttpContext.User.Identity?.IsAuthenticated != true)
        {
            context.Result = new UnauthorizedObjectResult(ApiResponse.Fail("Authentication required."));
            return;
        }

        var hasAccess = await AccountingAccess.HasAsync(context.HttpContext.RequestServices, context.HttpContext.RequestAborted);
        if (!hasAccess)
        {
            context.Result = new ObjectResult(ApiResponse.Fail("You do not have access to the Accounting module."))
            {
                StatusCode = StatusCodes.Status403Forbidden
            };
        }
    }
}
