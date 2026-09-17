using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Enums;
using Xorva.Modules.Accounting.Reports.Queries.GetSalesOverview;

namespace Xorva.API.Controllers;

/// <summary>CRM &amp; Sales module dashboard/overview. Company Admin &amp; above.</summary>
[ApiController]
[Route("api/sales")]
[Authorize]
public class SalesController : ControllerBase
{
    private readonly IMediator _mediator;
    public SalesController(IMediator mediator) => _mediator = mediator;

    /// <summary>Headline CRM &amp; Sales figures for the module Overview.</summary>
    [HttpGet("overview")]
    [RequireRole(SystemRole.CompanyAdmin)]
    public async Task<IActionResult> Overview([FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new GetSalesOverviewQuery { CompanyId = companyId }));
}
