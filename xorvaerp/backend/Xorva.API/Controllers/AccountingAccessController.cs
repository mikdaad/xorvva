using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Common;

namespace Xorva.API.Controllers;

/// <summary>Tells the frontend whether the current user may see/use Accounting (nav visibility).</summary>
[ApiController]
[Route("api/accounting/my-access")]
[Authorize]
public class AccountingAccessController : ControllerBase
{
    public record MyAccessDto
    {
        public bool HasAccountingAccess { get; init; }
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var has = await AccountingAccess.HasAsync(HttpContext.RequestServices, HttpContext.RequestAborted);
        return Ok(ApiResponse<MyAccessDto>.Ok(new MyAccessDto { HasAccountingAccess = has }));
    }
}
