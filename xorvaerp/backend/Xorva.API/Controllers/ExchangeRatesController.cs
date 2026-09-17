using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Modules.Accounting.Currency.Commands.DeleteExchangeRate;
using Xorva.Modules.Accounting.Currency.Commands.RunFxRevaluation;
using Xorva.Modules.Accounting.Currency.Commands.UpsertExchangeRate;
using Xorva.Modules.Accounting.Currency.Queries.ListExchangeRates;

namespace Xorva.API.Controllers;

/// <summary>Company exchange rates (base-per-foreign). Accounting access required.</summary>
[ApiController]
[Route("api/accounting/exchange-rates")]
[Authorize]
public class ExchangeRatesController : ControllerBase
{
    private readonly IMediator _mediator;
    public ExchangeRatesController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    [RequireAccountingAccess]
    public async Task<IActionResult> List([FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new ListExchangeRatesQuery { CompanyId = companyId }));

    [HttpPost]
    [RequireAccountingAccess]
    public async Task<IActionResult> Upsert([FromBody] UpsertExchangeRateCommand command)
        => Ok(await _mediator.Send(command));

    [HttpDelete("{id:guid}")]
    [RequireAccountingAccess]
    public async Task<IActionResult> Delete(Guid id, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new DeleteExchangeRateCommand(id, companyId)));

    /// <summary>Period-end unrealized FX revaluation of open foreign receivables/payables.</summary>
    [HttpPost("revalue")]
    [RequireAccountingAccess]
    public async Task<IActionResult> Revalue([FromBody] RunFxRevaluationCommand command)
        => Ok(await _mediator.Send(command));
}
