using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Xorva.Core.Common;

namespace Xorva.API.Filters;

/// <summary>
/// When a controller returns a body flagged PendingApproval (the action was
/// intercepted and queued instead of executed), rewrite the HTTP status to
/// 202 Accepted — the correct semantic for "received, not yet acted upon."
/// Registered globally.
/// </summary>
public class ApprovalStatusResultFilter : IResultFilter
{
    public void OnResultExecuting(ResultExecutingContext context)
    {
        if (context.Result is ObjectResult { Value: IApprovalAware { PendingApproval: true } } result)
        {
            result.StatusCode = StatusCodes.Status202Accepted;
        }
    }

    public void OnResultExecuted(ResultExecutedContext context) { }
}
