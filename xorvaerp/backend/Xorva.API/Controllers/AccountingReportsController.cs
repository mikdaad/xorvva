using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Enums;
using Xorva.Modules.Accounting.Ledger.Queries.GetTrialBalance;
using Xorva.Modules.Accounting.Reports.Queries.GetAgedPayables;
using Xorva.Modules.Accounting.Reports.Queries.GetAgedReceivables;
using Xorva.Modules.Accounting.Reports.Queries.GetBalanceSheet;
using Xorva.Modules.Accounting.Reports.Queries.GetCashFlow;
using Xorva.Modules.Accounting.Reports.Queries.GetFinanceDashboard;
using Xorva.Modules.Accounting.Reports.Queries.GetGeneralLedger;
using Xorva.Modules.Accounting.Reports.Queries.GetProfitAndLoss;
using Xorva.Modules.Accounting.Tax.Queries.GetVatReturn;

namespace Xorva.API.Controllers;

/// <summary>Financial reports (read models computed from the ledger). Company Admin &amp; above.</summary>
[ApiController]
[Route("api/accounting/reports")]
[Authorize]
public class AccountingReportsController : ControllerBase
{
    private readonly IMediator _mediator;
    public AccountingReportsController(IMediator mediator) => _mediator = mediator;

    [HttpGet("trial-balance")]
    [RequireAccountingAccess]
    public async Task<IActionResult> TrialBalance([FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new GetTrialBalanceQuery { CompanyId = companyId }));

    [HttpGet("profit-and-loss")]
    [RequireAccountingAccess]
    public async Task<IActionResult> ProfitAndLoss([FromQuery] DateTime? from = null, [FromQuery] DateTime? to = null, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new GetProfitAndLossQuery { From = from, To = to, CompanyId = companyId }));

    [HttpGet("balance-sheet")]
    [RequireAccountingAccess]
    public async Task<IActionResult> BalanceSheet([FromQuery] DateTime? asOf = null, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new GetBalanceSheetQuery { AsOf = asOf, CompanyId = companyId }));

    [HttpGet("dashboard")]
    [RequireAccountingAccess]
    public async Task<IActionResult> Dashboard([FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new GetFinanceDashboardQuery { CompanyId = companyId }));

    [HttpGet("aged-receivables")]
    [RequireAccountingAccess]
    public async Task<IActionResult> AgedReceivables([FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new GetAgedReceivablesQuery { CompanyId = companyId }));

    [HttpGet("aged-payables")]
    [RequireAccountingAccess]
    public async Task<IActionResult> AgedPayables([FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new GetAgedPayablesQuery { CompanyId = companyId }));

    [HttpGet("vat-return")]
    [RequireAccountingAccess]
    public async Task<IActionResult> VatReturn([FromQuery] DateTime? from = null, [FromQuery] DateTime? to = null, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new GetVatReturnQuery { From = from, To = to, CompanyId = companyId }));

    [HttpGet("cash-flow")]
    [RequireAccountingAccess]
    public async Task<IActionResult> CashFlow([FromQuery] DateTime? from = null, [FromQuery] DateTime? to = null, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new GetCashFlowQuery { From = from, To = to, CompanyId = companyId }));

    [HttpGet("general-ledger")]
    [RequireAccountingAccess]
    public async Task<IActionResult> GeneralLedger([FromQuery] Guid accountId, [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new GetGeneralLedgerQuery { AccountId = accountId, From = from, To = to, CompanyId = companyId }));
}
