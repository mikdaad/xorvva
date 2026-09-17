using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Enums;
using Xorva.Modules.Accounting.Tax.Commands.CreateTaxRate;
using Xorva.Modules.Accounting.Tax.Commands.SeedTaxRates;
using Xorva.Modules.Accounting.Tax.Queries.ListTaxRates;

namespace Xorva.API.Controllers;

/// <summary>VAT / tax rates. Company Admin &amp; above.</summary>
[ApiController]
[Route("api/accounting/tax-rates")]
[Authorize]
public class TaxRatesController : ControllerBase
{
    private readonly IMediator _mediator;
    public TaxRatesController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    [RequireAccountingAccess]
    public async Task<IActionResult> List([FromQuery] bool includeInactive = false, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new ListTaxRatesQuery { IncludeInactive = includeInactive, CompanyId = companyId }));

    [HttpPost]
    [RequireAccountingAccess]
    public async Task<IActionResult> Create([FromBody] CreateTaxRateCommand command)
        => StatusCode(StatusCodes.Status201Created, await _mediator.Send(command));

    [HttpPost("seed")]
    [RequireAccountingAccess]
    public async Task<IActionResult> Seed([FromBody] SeedTaxRatesCommand command)
        => Ok(await _mediator.Send(command));
}
