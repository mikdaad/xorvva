using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Modules.Accounting.Purchases.Commands.CreateDebitNote;
using Xorva.Modules.Accounting.Purchases.Queries.ListDebitNotes;

namespace Xorva.API.Controllers;

/// <summary>Purchase debit notes (supplier returns / adjustments). Accounting access.</summary>
[ApiController]
[Route("api/accounting/debit-notes")]
[Authorize]
public class DebitNotesController : ControllerBase
{
    private readonly IMediator _mediator;
    public DebitNotesController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    [RequireAccountingAccess]
    public async Task<IActionResult> List([FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new ListDebitNotesQuery { CompanyId = companyId }));

    [HttpPost]
    [RequireAccountingAccess]
    public async Task<IActionResult> Create([FromBody] CreateDebitNoteCommand command)
        => StatusCode(StatusCodes.Status201Created, await _mediator.Send(command));
}
