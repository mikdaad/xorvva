using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Modules.Accounting.Ledger.Queries.GetLedgerReports;
using Xorva.Modules.Accounting.Reports.Queries.ExportReport;

namespace Xorva.API.Controllers;

/// <summary>
/// SQL-computed reports ported from TrueLedge (schema <c>accounting</c>, 0007). Payloads keep TrueLedge's camelCase
/// report shapes. The original C# reports under /api/accounting/reports remain available unchanged.
/// </summary>
[ApiController]
[Route("api/accounting/ledger-reports")]
[Authorize]
[RequireAccountingAccess]
public class LedgerReportsController : ControllerBase
{
    private readonly IMediator _mediator;
    public LedgerReportsController(IMediator mediator) => _mediator = mediator;

    [HttpGet("balance-sheet")]
    public async Task<IActionResult> BalanceSheet([FromQuery] Guid? companyId = null, [FromQuery] DateOnly? asOf = null)
        => Ok(await _mediator.Send(new GetLedgerBalanceSheetQuery { CompanyId = companyId, AsOf = asOf }));

    [HttpGet("trial-balance")]
    public async Task<IActionResult> TrialBalance([FromQuery] Guid? companyId = null, [FromQuery] DateOnly? from = null, [FromQuery] DateOnly? to = null)
        => Ok(await _mediator.Send(new GetLedgerTrialBalanceQuery { CompanyId = companyId, From = from, To = to }));

    [HttpGet("ledger-statement/{accountId:guid}")]
    public async Task<IActionResult> LedgerStatement(Guid accountId, [FromQuery] Guid? companyId = null,
        [FromQuery] DateOnly? from = null, [FromQuery] DateOnly? to = null, [FromQuery] Guid? costCentreId = null)
        => Ok(await _mediator.Send(new GetLedgerStatementQuery { AccountId = accountId, CompanyId = companyId, From = from, To = to, CostCentreId = costCentreId }));

    [HttpGet("bank-reconciliation/{bankAccountId:guid}")]
    public async Task<IActionResult> BankReconciliation(Guid bankAccountId, [FromQuery] Guid? companyId = null, [FromQuery] DateOnly? asOf = null)
        => Ok(await _mediator.Send(new GetBankReconciliationSummaryQuery { BankAccountId = bankAccountId, CompanyId = companyId, AsOf = asOf }));

    /// <summary>
    /// PDF / XLSX export (port of TrueLedge <c>/api/reports/export</c>). Same filters as the JSON endpoints;
    /// returns the file as an attachment. Example: <c>GET /api/accounting/ledger-reports/export?reportType=Transactions&amp;format=Xlsx&amp;from=2026-01-01</c>.
    /// </summary>
    [HttpGet("export")]
    public async Task<IActionResult> Export([FromQuery] ExportReportQuery query)
    {
        var file = await _mediator.Send(query);
        Response.Headers.CacheControl = "no-store, max-age=0";
        return File(file.Content, file.ContentType, file.FileName);
    }
}
