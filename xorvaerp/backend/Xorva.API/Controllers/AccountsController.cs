using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Enums;
using Xorva.Modules.Accounting.Ledger.Commands.CreateAccount;
using Xorva.Modules.Accounting.Ledger.Commands.PostOpeningBalances;
using Xorva.Modules.Accounting.Ledger.Commands.SeedChartOfAccounts;
using Xorva.Modules.Accounting.Ledger.Commands.UpdateAccount;
using Xorva.Modules.Accounting.Ledger.Queries.ListAccounts;

namespace Xorva.API.Controllers;

/// <summary>
/// Chart of Accounts endpoints. Finance is gated at Company Admin &amp; above (the
/// department-function upgrade in Stage E will also admit an Accounting-dept manager).
/// </summary>
[ApiController]
[Route("api/accounting/accounts")]
[Authorize]
public class AccountsController : ControllerBase
{
    private readonly IMediator _mediator;
    public AccountsController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    [RequireAccountingAccess]
    public async Task<IActionResult> List([FromQuery] bool includeInactive = false, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new ListAccountsQuery { IncludeInactive = includeInactive, CompanyId = companyId }));

    [HttpPost]
    [RequireAccountingAccess]
    public async Task<IActionResult> Create([FromBody] CreateAccountCommand command)
        => StatusCode(StatusCodes.Status201Created, await _mediator.Send(command));

    [HttpPut("{id:guid}")]
    [RequireAccountingAccess]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateAccountCommand command)
        => Ok(await _mediator.Send(command with { Id = id }));

    /// <summary>Seed the chart of accounts from an industry template (one-time, per company).</summary>
    [HttpPost("seed")]
    [RequireAccountingAccess]
    public async Task<IActionResult> Seed([FromBody] SeedChartOfAccountsCommand command)
        => Ok(await _mediator.Send(command));

    /// <summary>Post one-time opening balances (difference auto-balanced to Retained Earnings).</summary>
    [HttpPost("opening-balances")]
    [RequireAccountingAccess]
    public async Task<IActionResult> OpeningBalances([FromBody] PostOpeningBalancesCommand command)
        => Ok(await _mediator.Send(command));
}
