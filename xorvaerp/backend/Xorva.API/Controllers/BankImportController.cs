using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Filters;
using Xorva.Core.Common;
using Xorva.Modules.Accounting.Banking.Commands.ImportBankStatement;
using Xorva.Modules.Accounting.Banking.Commands.MatchBankLine;
using Xorva.Modules.Accounting.Banking.Commands.UpsertBankMatchRule;
using Xorva.Modules.Accounting.Banking.Queries.GetBankStatement;
using Xorva.Modules.Accounting.Banking.Queries.ListBankStatements;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.API.Controllers;

/// <summary>
/// Bank statement CSV import (ENBD / ADCB / FAB / Mashreq / RAK / DIB) and line matching against the
/// ledger. Complements the existing bank-reconciliation endpoints; confirming a match reconciles the GL line.
/// </summary>
[ApiController]
[Route("api/accounting/bank-statements")]
[Authorize]
[RequireAccountingAccess]
public class BankImportController : ControllerBase
{
    private const long MaxUpload = 10 * 1024 * 1024;
    private readonly IMediator _mediator;
    public BankImportController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Guid? companyId = null, [FromQuery] Guid? bankAccountId = null)
        => Ok(await _mediator.Send(new ListBankStatementsQuery { CompanyId = companyId, BankAccountId = bankAccountId }));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, [FromQuery] Guid? companyId = null, [FromQuery] BankMatchStatus? status = null)
        => Ok(await _mediator.Send(new GetBankStatementQuery { Id = id, CompanyId = companyId, Status = status }));

    /// <summary>Parse a CSV without storing anything — powers the import preview step.</summary>
    [HttpPost("preview")]
    [RequestSizeLimit(MaxUpload)]
    public async Task<IActionResult> Preview([FromForm] IFormFile file, [FromForm] Guid? companyId = null)
    {
        if (file is null || file.Length == 0) return BadRequest(ApiResponse.Fail("No file provided."));
        return Ok(await _mediator.Send(new PreviewBankStatementCommand
        {
            CompanyId = companyId, FileName = file.FileName, Content = await ReadAsync(file),
        }));
    }

    /// <summary>Import a CSV for a bank account (multipart: file, bankAccountId, optional statementDate/openingBalance/closingBalance).</summary>
    [HttpPost("import")]
    [RequestSizeLimit(MaxUpload)]
    public async Task<IActionResult> Import([FromForm] IFormFile file, [FromForm] Guid bankAccountId, [FromForm] Guid? companyId = null,
        [FromForm] DateOnly? statementDate = null, [FromForm] decimal? openingBalance = null, [FromForm] decimal? closingBalance = null)
    {
        if (file is null || file.Length == 0) return BadRequest(ApiResponse.Fail("No file provided."));
        var result = await _mediator.Send(new ImportBankStatementCommand
        {
            CompanyId = companyId, BankAccountId = bankAccountId, FileName = file.FileName, Content = await ReadAsync(file),
            StatementDate = statementDate, OpeningBalance = openingBalance, ClosingBalance = closingBalance,
        });
        return StatusCode(StatusCodes.Status201Created, result);
    }

    [HttpPost("{id:guid}/suggest")]
    public async Task<IActionResult> Suggest(Guid id, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new SuggestBankMatchesCommand { StatementId = id, CompanyId = companyId }));

    // ── lines ──
    [HttpGet("lines/{lineId:guid}/candidates")]
    public async Task<IActionResult> Candidates(Guid lineId, [FromQuery] Guid? companyId = null, [FromQuery] int windowDays = 30, [FromQuery] bool exactAmount = true)
        => Ok(await _mediator.Send(new GetBankMatchCandidatesQuery { LineId = lineId, CompanyId = companyId, WindowDays = windowDays, ExactAmount = exactAmount }));

    [HttpPost("lines/{lineId:guid}/confirm")]
    public async Task<IActionResult> Confirm(Guid lineId, [FromBody] MatchBankLineCommand command)
        => Ok(await _mediator.Send(command with { LineId = lineId, Action = BankLineAction.Confirm }));

    [HttpPost("lines/{lineId:guid}/unmatch")]
    public async Task<IActionResult> Unmatch(Guid lineId, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new MatchBankLineCommand { LineId = lineId, CompanyId = companyId, Action = BankLineAction.Unmatch }));

    [HttpPost("lines/{lineId:guid}/ignore")]
    public async Task<IActionResult> Ignore(Guid lineId, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new MatchBankLineCommand { LineId = lineId, CompanyId = companyId, Action = BankLineAction.Ignore }));

    // ── rules ──
    [HttpGet("rules")]
    public async Task<IActionResult> ListRules([FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new ListBankMatchRulesQuery { CompanyId = companyId }));

    [HttpPost("rules")]
    public async Task<IActionResult> CreateRule([FromBody] UpsertBankMatchRuleCommand command)
        => StatusCode(StatusCodes.Status201Created, await _mediator.Send(command with { Id = null }));

    [HttpPut("rules/{id:guid}")]
    public async Task<IActionResult> UpdateRule(Guid id, [FromBody] UpsertBankMatchRuleCommand command)
        => Ok(await _mediator.Send(command with { Id = id }));

    [HttpDelete("rules/{id:guid}")]
    public async Task<IActionResult> DeleteRule(Guid id, [FromQuery] Guid? companyId = null)
        => Ok(await _mediator.Send(new DeleteBankMatchRuleCommand { Id = id, CompanyId = companyId }));

    private static async Task<byte[]> ReadAsync(IFormFile file)
    {
        using var ms = new MemoryStream();
        await file.CopyToAsync(ms);
        return ms.ToArray();
    }
}
