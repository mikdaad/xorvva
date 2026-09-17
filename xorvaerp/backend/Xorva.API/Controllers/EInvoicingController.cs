using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Modules.Accounting.EInvoicing.Commands.UpdateEInvoicingSettings;
using Xorva.Modules.Accounting.EInvoicing.Queries.GetEInvoicingSettings;

namespace Xorva.API.Controllers;

/// <summary>The seller's e-invoicing (UBL / PINT AE) identity settings. Accounting access required.</summary>
[ApiController]
[Route("api/accounting/einvoicing")]
[Authorize]
public class EInvoicingController : ControllerBase
{
    private readonly IMediator _mediator;
    public EInvoicingController(IMediator mediator) => _mediator = mediator;

    [HttpGet("settings")]
    [RequireAccountingAccess]
    public async Task<IActionResult> GetSettings([FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new GetEInvoicingSettingsQuery { CompanyId = companyId }));

    [HttpPut("settings")]
    [RequireAccountingAccess]
    public async Task<IActionResult> UpdateSettings([FromBody] UpdateEInvoicingSettingsCommand command)
        => Ok(await _mediator.Send(command));
}
