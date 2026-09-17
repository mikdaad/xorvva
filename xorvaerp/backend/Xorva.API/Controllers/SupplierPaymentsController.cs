using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Enums;
using Xorva.Modules.Accounting.Purchases.Commands.RecordSupplierPayment;
using Xorva.Modules.Accounting.Purchases.Queries.ListSupplierPayments;

namespace Xorva.API.Controllers;

/// <summary>Supplier payments (money out). Company Admin &amp; above.</summary>
[ApiController]
[Route("api/accounting/supplier-payments")]
[Authorize]
public class SupplierPaymentsController : ControllerBase
{
    private readonly IMediator _mediator;
    public SupplierPaymentsController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    [RequireAccountingAccess]
    public async Task<IActionResult> List([FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new ListSupplierPaymentsQuery { CompanyId = companyId }));

    [HttpPost]
    [RequireAccountingAccess]
    public async Task<IActionResult> Record([FromBody] RecordSupplierPaymentCommand command)
        => StatusCode(StatusCodes.Status201Created, await _mediator.Send(command));
}
