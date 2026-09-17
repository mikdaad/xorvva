using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Modules.Accounting.Ledger.Commands.CloseYear;
using Xorva.Modules.Accounting.Ledger.Commands.CreateFiscalYear;
using Xorva.Modules.Accounting.Ledger.Commands.SetFiscalPeriodClosed;
using Xorva.Modules.Accounting.Ledger.Queries.ListFiscalYears;

namespace Xorva.API.Controllers;

/// <summary>Fiscal years, period locking, and year-end close.</summary>
[ApiController]
[Route("api/accounting/fiscal-years")]
[Authorize]
public class FiscalYearsController : ControllerBase
{
    private readonly IMediator _mediator;
    public FiscalYearsController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    [RequireAccountingAccess]
    public async Task<IActionResult> List([FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new ListFiscalYearsQuery { CompanyId = companyId }));

    [HttpPost]
    [RequireAccountingAccess]
    public async Task<IActionResult> Create([FromBody] CreateFiscalYearCommand command)
        => StatusCode(StatusCodes.Status201Created, await _mediator.Send(command));

    /// <summary>Year-end close — roll P&amp;L into Retained Earnings and lock the year.</summary>
    [HttpPost("{id:guid}/close")]
    [RequireAccountingAccess]
    public async Task<IActionResult> Close(Guid id, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new CloseYearCommand { Id = id, CompanyId = companyId }));

    [HttpPut("periods/{id:guid}")]
    [RequireAccountingAccess]
    public async Task<IActionResult> SetPeriodClosed(Guid id, [FromBody] SetFiscalPeriodClosedCommand command)
        => Ok(await _mediator.Send(command with { Id = id }));
}
