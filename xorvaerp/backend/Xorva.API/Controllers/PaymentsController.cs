using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Enums;
using Xorva.Modules.Accounting.Sales.Commands.RecordCustomerPayment;
using Xorva.Modules.Accounting.Sales.Queries.ListPayments;

namespace Xorva.API.Controllers;

/// <summary>Customer payments (money in). Company Admin &amp; above.</summary>
[ApiController]
[Route("api/accounting/payments")]
[Authorize]
public class PaymentsController : ControllerBase
{
    private readonly IMediator _mediator;
    public PaymentsController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    [RequireAccountingAccess]
    public async Task<IActionResult> List([FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new ListPaymentsQuery { CompanyId = companyId }));

    [HttpPost]
    [RequireAccountingAccess]
    public async Task<IActionResult> Record([FromBody] RecordCustomerPaymentCommand command)
        => StatusCode(StatusCodes.Status201Created, await _mediator.Send(command));
}
