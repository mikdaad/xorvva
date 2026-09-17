using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Enums;
using Xorva.Modules.Accounting.Banking.Commands.CreateBankAccount;
using Xorva.Modules.Accounting.Banking.Commands.SetLineReconciled;
using Xorva.Modules.Accounting.Banking.Queries.GetBankReconciliation;
using Xorva.Modules.Accounting.Banking.Queries.ListBankAccounts;

namespace Xorva.API.Controllers;

/// <summary>Bank &amp; cash accounts payments flow through. Company Admin &amp; above.</summary>
[ApiController]
[Route("api/accounting/bank-accounts")]
[Authorize]
public class BankAccountsController : ControllerBase
{
    private readonly IMediator _mediator;
    public BankAccountsController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    [RequireAccountingAccess]
    public async Task<IActionResult> List([FromQuery] bool includeInactive = false, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new ListBankAccountsQuery { IncludeInactive = includeInactive, CompanyId = companyId }));

    [HttpPost]
    [RequireAccountingAccess]
    public async Task<IActionResult> Create([FromBody] CreateBankAccountCommand command)
        => StatusCode(StatusCodes.Status201Created, await _mediator.Send(command));

    /// <summary>Reconciliation working sheet for a bank account.</summary>
    [HttpGet("{id:guid}/reconciliation")]
    [RequireAccountingAccess]
    public async Task<IActionResult> Reconciliation(Guid id, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new GetBankReconciliationQuery { BankAccountId = id, CompanyId = companyId }));

    /// <summary>Toggle a bank line's reconciled status.</summary>
    [HttpPut("reconciliation/lines/{id:guid}")]
    [RequireAccountingAccess]
    public async Task<IActionResult> SetLineReconciled(Guid id, [FromBody] SetLineReconciledCommand command)
        => Ok(await _mediator.Send(command with { Id = id }));
}
