using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Enums;
using Xorva.Modules.Accounting.EInvoicing.Queries.GetInvoiceEInvoice;
using Xorva.Modules.Accounting.Sales.Commands.CreateInvoice;
using Xorva.Modules.Accounting.Sales.Commands.PostInvoice;
using Xorva.Modules.Accounting.Sales.Commands.VoidInvoice;
using Xorva.Modules.Accounting.Sales.Queries.GetInvoice;
using Xorva.Modules.Accounting.Sales.Queries.ListInvoices;

namespace Xorva.API.Controllers;

/// <summary>Customer invoices. Company Admin &amp; above. Posting produces the auto-journal.</summary>
[ApiController]
[Route("api/accounting/invoices")]
[Authorize]
public class InvoicesController : ControllerBase
{
    private readonly IMediator _mediator;
    public InvoicesController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    [RequireAccountingAccess]
    public async Task<IActionResult> List([FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new ListInvoicesQuery { CompanyId = companyId }));

    [HttpGet("{id:guid}")]
    [RequireAccountingAccess]
    public async Task<IActionResult> Get(Guid id, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new GetInvoiceQuery { Id = id, CompanyId = companyId }));

    [HttpPost]
    [RequireAccountingAccess]
    public async Task<IActionResult> Create([FromBody] CreateInvoiceCommand command)
        => StatusCode(StatusCodes.Status201Created, await _mediator.Send(command));

    /// <summary>Post the draft → auto-journal (DR AR / CR Sales / CR VAT).</summary>
    [HttpPost("{id:guid}/post")]
    [RequireAccountingAccess]
    public async Task<IActionResult> Post(Guid id, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new PostInvoiceCommand { Id = id, CompanyId = companyId }));

    [HttpPost("{id:guid}/void")]
    [RequireAccountingAccess]
    public async Task<IActionResult> Void(Guid id, [FromBody] VoidInvoiceCommand command)
        => Ok(await _mediator.Send(command with { Id = id }));

    /// <summary>The UBL 2.1 / PINT AE e-invoice for a posted invoice (XML + compliance warnings).</summary>
    [HttpGet("{id:guid}/einvoice")]
    [RequireAccountingAccess]
    public async Task<IActionResult> EInvoice(Guid id, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new GetInvoiceEInvoiceQuery { Id = id, CompanyId = companyId }));
}
