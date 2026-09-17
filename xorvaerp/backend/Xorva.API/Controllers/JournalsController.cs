using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Enums;
using Xorva.Modules.Accounting.Ledger.Commands.CreateManualJournal;
using Xorva.Modules.Accounting.Ledger.Commands.VoidJournal;
using Xorva.Modules.Accounting.Ledger.Queries.GetJournal;
using Xorva.Modules.Accounting.Ledger.Queries.ListJournals;

namespace Xorva.API.Controllers;

/// <summary>General ledger — manual journals and the journal register. Company Admin &amp; above.</summary>
[ApiController]
[Route("api/accounting/journals")]
[Authorize]
public class JournalsController : ControllerBase
{
    private readonly IMediator _mediator;
    public JournalsController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    [RequireAccountingAccess]
    public async Task<IActionResult> List([FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new ListJournalsQuery { CompanyId = companyId }));

    [HttpGet("{id:guid}")]
    [RequireAccountingAccess]
    public async Task<IActionResult> Get(Guid id, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new GetJournalQuery { Id = id, CompanyId = companyId }));

    [HttpPost]
    [RequireAccountingAccess]
    public async Task<IActionResult> Create([FromBody] CreateManualJournalCommand command)
        => StatusCode(StatusCodes.Status201Created, await _mediator.Send(command));

    [HttpPost("{id:guid}/void")]
    [RequireAccountingAccess]
    public async Task<IActionResult> Void(Guid id, [FromBody] VoidJournalCommand command)
        => Ok(await _mediator.Send(command with { Id = id }));
}
