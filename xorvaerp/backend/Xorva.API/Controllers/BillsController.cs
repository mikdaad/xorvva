using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Enums;
using Xorva.Modules.Accounting.Purchases.Commands.CreateBill;
using Xorva.Modules.Accounting.Purchases.Commands.PostBill;
using Xorva.Modules.Accounting.Purchases.Commands.VoidBill;
using Xorva.Modules.Accounting.Purchases.Queries.GetBill;
using Xorva.Modules.Accounting.Purchases.Queries.ListBills;

namespace Xorva.API.Controllers;

/// <summary>Supplier bills (accounts payable). Company Admin &amp; above. Posting produces the auto-journal.</summary>
[ApiController]
[Route("api/accounting/bills")]
[Authorize]
public class BillsController : ControllerBase
{
    private readonly IMediator _mediator;
    public BillsController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    [RequireAccountingAccess]
    public async Task<IActionResult> List([FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new ListBillsQuery { CompanyId = companyId }));

    [HttpGet("{id:guid}")]
    [RequireAccountingAccess]
    public async Task<IActionResult> Get(Guid id, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new GetBillQuery { Id = id, CompanyId = companyId }));

    [HttpPost]
    [RequireAccountingAccess]
    public async Task<IActionResult> Create([FromBody] CreateBillCommand command)
        => StatusCode(StatusCodes.Status201Created, await _mediator.Send(command));

    [HttpPost("{id:guid}/post")]
    [RequireAccountingAccess]
    public async Task<IActionResult> Post(Guid id, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new PostBillCommand { Id = id, CompanyId = companyId }));

    [HttpPost("{id:guid}/void")]
    [RequireAccountingAccess]
    public async Task<IActionResult> Void(Guid id, [FromBody] VoidBillCommand command)
        => Ok(await _mediator.Send(command with { Id = id }));
}
