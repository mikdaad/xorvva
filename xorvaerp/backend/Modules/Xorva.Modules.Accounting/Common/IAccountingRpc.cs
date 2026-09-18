using System.Text.Json;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.Common;

/// <summary>
/// Typed gateway to the PostgreSQL functions ported from TrueLedge (schema <c>accounting</c>,
/// scripts <c>Sql/Accounting/0003–0007</c>). Handlers never write SQL themselves: every RPC
/// has one method here, and the implementation (Infrastructure) runs it on the SAME
/// connection/transaction as the EF DbContext so the tenant session context set by
/// <c>TenantSessionInterceptor</c> applies and RLS sees the caller.
///
/// PostgreSQL <c>RAISE EXCEPTION</c>s are translated by the implementation into Xorva's
/// exception types by SQLSTATE: check_violation / raise_exception → BadRequest,
/// no_data_found → NotFound, insufficient_privilege → Forbidden, unique_violation → Conflict.
///
/// Unit tests substitute a fake (SQLite has no RPCs); integration coverage of the SQL itself
/// is in <c>Sql/Tests</c>.
/// </summary>
public interface IAccountingRpc
{
    // ── 0003 vouchers ────────────────────────────────────────────────────────
    /// <summary>accounting.generate_voucher_number — PREFIX-YEAR-NNNNN, advances the per-company/type/year sequence.</summary>
    Task<string> GenerateVoucherNumberAsync(Guid companyId, VoucherType type, int fiscalYear, CancellationToken ct);

    /// <summary>accounting.post_voucher_atomic — validates, writes JournalEntries/Lines, flips the voucher to Posted. Returns the journal entry id.</summary>
    Task<Guid> PostVoucherAsync(Guid voucherId, IReadOnlyList<RpcLedgerLine> lines, CancellationToken ct);

    /// <summary>accounting.reverse_voucher — mirrors the lines into a new posted voucher, voids the original entry. Returns the reversal voucher id.</summary>
    Task<Guid> ReverseVoucherAsync(Guid voucherId, string reason, DateOnly? reversalDate, CancellationToken ct);

    // ── 0004 bank import ─────────────────────────────────────────────────────
    /// <summary>accounting.import_bank_statement — header + lines + auto-suggest in one transaction.</summary>
    Task<RpcBankImportResult> ImportBankStatementAsync(Guid bankAccountId, string sourceFile, string sourceFormat, string linesJson,
        DateOnly? statementDate, decimal? openingBalance, decimal? closingBalance, CancellationToken ct);
    Task<int> SuggestBankMatchesAsync(Guid statementId, CancellationToken ct);
    Task ConfirmBankMatchAsync(Guid bankLineId, Guid journalLineId, CancellationToken ct);
    Task UnmatchBankLineAsync(Guid bankLineId, CancellationToken ct);
    Task IgnoreBankLineAsync(Guid bankLineId, CancellationToken ct);

    // ── 0005 periods ─────────────────────────────────────────────────────────
    /// <summary>accounting.set_period_close_status — Open / SoftClosed / HardClosed with ordering + role checks.</summary>
    Task SetPeriodCloseStatusAsync(Guid periodId, PeriodCloseStatus status, CancellationToken ct);

    // ── 0006 AI document inbox ───────────────────────────────────────────────
    Task<Guid> UploadDocumentAsync(Guid companyId, string fileName, string contentType, byte[] data, DocumentKind kind, IReadOnlyList<string>? tags, CancellationToken ct);
    Task BeginDocumentExtractionAsync(Guid documentId, CancellationToken ct);
    /// <summary>Returns the new extraction id.</summary>
    Task<Guid> CompleteDocumentExtractionAsync(Guid documentId, string extractedJson, string? rawResponseJson, string modelUsed, string? modelVersion, int? processingTimeMs, CancellationToken ct);
    Task FailDocumentExtractionAsync(Guid documentId, string message, CancellationToken ct);
    Task OverrideDocumentFieldAsync(Guid extractionId, string fieldName, string? value, CancellationToken ct);
    Task AcceptDocumentExtractionAsync(Guid extractionId, Guid voucherId, CancellationToken ct);
    Task RejectDocumentAsync(Guid documentId, string? reason, CancellationToken ct);

    // ── 0007 reports (JSONB results carry camelCase keys identical to TrueLedge reports/types.ts) ──
    Task<JsonElement> GetBalanceSheetAsync(Guid? companyId, DateOnly asOf, CancellationToken ct);
    Task<JsonElement> GetLedgerStatementAsync(Guid accountId, DateOnly? from, DateOnly? to, Guid? costCentreId, CancellationToken ct);
    Task<JsonElement> GetBankReconciliationSummaryAsync(Guid bankAccountId, DateOnly asOf, CancellationToken ct);
    Task<IReadOnlyList<RpcRegisterRow>> GetTransactionRegisterAsync(Guid? companyId, DateOnly? from, DateOnly? to, VoucherType? type, VoucherStatus? status,
        Guid? contactId, string? search, int limit, int offset, CancellationToken ct);
    Task<IReadOnlyList<RpcTrialBalanceRow>> GetTrialBalanceAsync(Guid? companyId, DateOnly? from, DateOnly? to, CancellationToken ct);
    Task<IReadOnlyList<RpcCostCentreReportRow>> GetCostCentreReportAsync(Guid? companyId, Guid? dimensionId, DateOnly? from, DateOnly? to, CancellationToken ct);
}

/// <summary>One ledger line handed to post_voucher_atomic (base-currency amounts, 2 dp).</summary>
public sealed record RpcLedgerLine(
    Guid AccountId,
    decimal BaseDebit,
    decimal BaseCredit,
    Guid? ContactId = null,
    Guid? TaxRateId = null,
    Guid? CostCentreId = null,
    string? Description = null);

public sealed record RpcBankImportResult(Guid StatementId, int LinesImported, int LinesSkipped);

/// <summary>Row of accounting.get_transaction_register (window totals repeat on every row).</summary>
public sealed record RpcRegisterRow(
    Guid Id, Guid CompanyId, DateOnly VoucherDate, string VoucherNumber, string VoucherType, string Status,
    string? ContactName, string? Reference, string? Narration, string Currency,
    decimal TotalAmount, decimal BaseTotalAmount, decimal? AmountDue,
    Guid? JournalEntryId, string? EntryNumber, string? CreatedByName, DateTime CreatedAt,
    long TotalCount, decimal TotalBaseAmount);

public sealed record RpcTrialBalanceRow(
    Guid AccountId, string Code, string Name, string AccountType, string AccountSubType, bool IsGroup,
    decimal OpeningDebit, decimal OpeningCredit, decimal PeriodDebit, decimal PeriodCredit, decimal ClosingDebit, decimal ClosingCredit);

public sealed record RpcCostCentreReportRow(
    Guid CostCentreId, Guid DimensionId, string DimensionName, string Code, string Name, Guid? ParentId, int Level, bool IsGroup,
    decimal Debit, decimal Credit, decimal Net, long LineCount);
