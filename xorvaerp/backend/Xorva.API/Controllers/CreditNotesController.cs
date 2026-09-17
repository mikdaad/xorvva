using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Modules.Accounting.Sales.Commands.CreateCreditNote;
using Xorva.Modules.Accounting.Sales.Queries.ListCreditNotes;

namespace Xorva.API.Controllers;

/// <summary>Sales credit notes (customer returns / adjustments). Accounting access.</summary>
[ApiController]
[Route("api/accounting/credit-notes")]
[Authorize]
public class CreditNotesController : ControllerBase
{
    private readonly IMediator _mediator;
    public CreditNotesController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    [RequireAccountingAccess]
    public async Task<IActionResult> List([FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new ListCreditNotesQuery { CompanyId = companyId }));

    [HttpPost]
    [RequireAccountingAccess]
    public async Task<IActionResult> Create([FromBody] CreateCreditNoteCommand command)
        => StatusCode(StatusCodes.Status201Created, await _mediator.Send(command));
}
