using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Vouchers.Entities;

namespace Xorva.Tests.Unit.TestHelpers;

/// <summary>
/// In-memory stand-in for the PostgreSQL RPCs (SQLite has no plpgsql). Records every call so tests can
/// assert what a handler would have sent to the database; the SQL itself is covered by
/// Xorva.Infrastructure/Sql/Tests against a real Postgres.
/// </summary>
public sealed class FakeAccountingRpc : IAccountingRpc
{
    private readonly IXorvaDbContext? _db;

    /// <param name="db">When supplied, PostVoucherAsync / ReverseVoucherAsync replay the status side-effects of
    /// <c>post_voucher_atomic</c> / <c>reverse_voucher</c> on the voucher row (Posted / Reversed), so handlers that
    /// re-read the voucher afterwards see what they would see on Postgres.</param>
    public FakeAccountingRpc(IXorvaDbContext? db = null) => _db = db;

    public List<(Guid VoucherId, IReadOnlyList<RpcLedgerLine> Lines)> Posted { get; } = [];
    public List<(Guid VoucherId, string Reason, DateOnly? Date)> Reversed { get; } = [];
    public List<(Guid BankLineId, Guid JournalLineId)> ConfirmedMatches { get; } = [];
    public List<Guid> Unmatched { get; } = [];
    public List<Guid> Ignored { get; } = [];
    public List<(Guid DocumentId, string Json)> CompletedExtractions { get; } = [];
    public List<(Guid DocumentId, string Message)> FailedExtractions { get; } = [];
    public List<(Guid ExtractionId, Guid VoucherId)> Accepted { get; } = [];
    public List<(Guid ExtractionId, string Field, string? Value)> Overrides { get; } = [];
    public List<(Guid DocumentId, string? Reason)> Rejected { get; } = [];
    public string? LastBankImportLinesJson { get; private set; }

    /// <summary>Set to make PostVoucherAsync throw (simulates a DB-side rejection such as a closed period).</summary>
    public Exception? PostFailure { get; set; }

    private readonly Dictionary<(Guid, VoucherType, int), int> _sequences = [];

    public Task<string> GenerateVoucherNumberAsync(Guid companyId, VoucherType type, int fiscalYear, CancellationToken ct)
    {
        var key = (companyId, type, fiscalYear);
        _sequences[key] = _sequences.GetValueOrDefault(key) + 1;
        var prefix = type switch
        {
            VoucherType.SalesInvoice => "SI", VoucherType.PurchaseBill => "PB", VoucherType.CreditNote => "CN", VoucherType.DebitNote => "DN",
            VoucherType.Receipt => "RV", VoucherType.Payment => "PV", VoucherType.Journal => "JV", VoucherType.Contra => "CT", _ => "OB",
        };
        return Task.FromResult($"{prefix}-{fiscalYear}-{_sequences[key]:00000}");
    }

    public async Task<Guid> PostVoucherAsync(Guid voucherId, IReadOnlyList<RpcLedgerLine> lines, CancellationToken ct)
    {
        if (PostFailure is not null) throw PostFailure;
        Posted.Add((voucherId, lines));
        var journalId = Guid.CreateVersion7();
        if (_db is not null)
            await _db.Set<Voucher>().Where(v => v.Id == voucherId).ExecuteUpdateAsync(u => u
                .SetProperty(v => v.Status, VoucherStatus.Posted)
                .SetProperty(v => v.PostedAt, DateTime.UtcNow), ct);
        return journalId;
    }

    public async Task<Guid> ReverseVoucherAsync(Guid voucherId, string reason, DateOnly? reversalDate, CancellationToken ct)
    {
        Reversed.Add((voucherId, reason, reversalDate));
        if (_db is not null)
            await _db.Set<Voucher>().Where(v => v.Id == voucherId).ExecuteUpdateAsync(u => u
                .SetProperty(v => v.Status, VoucherStatus.Reversed)
                .SetProperty(v => v.ReversalReason, reason), ct);
        return Guid.CreateVersion7();
    }

    public Task<RpcBankImportResult> ImportBankStatementAsync(Guid bankAccountId, string sourceFile, string sourceFormat, string linesJson,
        DateOnly? statementDate, decimal? openingBalance, decimal? closingBalance, CancellationToken ct)
    {
        LastBankImportLinesJson = linesJson;
        var count = JsonDocument.Parse(linesJson).RootElement.GetArrayLength();
        return Task.FromResult(new RpcBankImportResult(Guid.CreateVersion7(), count, 0));
    }

    public Task<int> SuggestBankMatchesAsync(Guid statementId, CancellationToken ct) => Task.FromResult(0);
    public Task ConfirmBankMatchAsync(Guid bankLineId, Guid journalLineId, CancellationToken ct) { ConfirmedMatches.Add((bankLineId, journalLineId)); return Task.CompletedTask; }
    public Task UnmatchBankLineAsync(Guid bankLineId, CancellationToken ct) { Unmatched.Add(bankLineId); return Task.CompletedTask; }
    public Task IgnoreBankLineAsync(Guid bankLineId, CancellationToken ct) { Ignored.Add(bankLineId); return Task.CompletedTask; }
    public Task SetPeriodCloseStatusAsync(Guid periodId, PeriodCloseStatus status, CancellationToken ct) => Task.CompletedTask;

    public Task<Guid> UploadDocumentAsync(Guid companyId, string fileName, string contentType, byte[] data, DocumentKind kind, IReadOnlyList<string>? tags, CancellationToken ct)
        => Task.FromResult(Guid.CreateVersion7());
    public Task BeginDocumentExtractionAsync(Guid documentId, CancellationToken ct) => Task.CompletedTask;
    public Task<Guid> CompleteDocumentExtractionAsync(Guid documentId, string extractedJson, string? rawResponseJson, string modelUsed, string? modelVersion, int? processingTimeMs, CancellationToken ct)
    { CompletedExtractions.Add((documentId, extractedJson)); return Task.FromResult(Guid.CreateVersion7()); }
    public Task FailDocumentExtractionAsync(Guid documentId, string message, CancellationToken ct) { FailedExtractions.Add((documentId, message)); return Task.CompletedTask; }
    public Task OverrideDocumentFieldAsync(Guid extractionId, string fieldName, string? value, CancellationToken ct) { Overrides.Add((extractionId, fieldName, value)); return Task.CompletedTask; }
    public Task AcceptDocumentExtractionAsync(Guid extractionId, Guid voucherId, CancellationToken ct) { Accepted.Add((extractionId, voucherId)); return Task.CompletedTask; }
    public Task RejectDocumentAsync(Guid documentId, string? reason, CancellationToken ct) { Rejected.Add((documentId, reason)); return Task.CompletedTask; }

    private static JsonElement Empty => JsonDocument.Parse("{}").RootElement.Clone();
    public Task<JsonElement> GetBalanceSheetAsync(Guid? companyId, DateOnly asOf, CancellationToken ct) => Task.FromResult(Empty);
    public Task<JsonElement> GetLedgerStatementAsync(Guid accountId, DateOnly? from, DateOnly? to, Guid? costCentreId, CancellationToken ct) => Task.FromResult(Empty);
    public Task<JsonElement> GetBankReconciliationSummaryAsync(Guid bankAccountId, DateOnly asOf, CancellationToken ct) => Task.FromResult(Empty);
    public Task<IReadOnlyList<RpcRegisterRow>> GetTransactionRegisterAsync(Guid? companyId, DateOnly? from, DateOnly? to, VoucherType? type, VoucherStatus? status,
        Guid? contactId, string? search, int limit, int offset, CancellationToken ct) => Task.FromResult<IReadOnlyList<RpcRegisterRow>>([]);
    public Task<IReadOnlyList<RpcTrialBalanceRow>> GetTrialBalanceAsync(Guid? companyId, DateOnly? from, DateOnly? to, CancellationToken ct) => Task.FromResult<IReadOnlyList<RpcTrialBalanceRow>>([]);
    public Task<IReadOnlyList<RpcCostCentreReportRow>> GetCostCentreReportAsync(Guid? companyId, Guid? dimensionId, DateOnly? from, DateOnly? to, CancellationToken ct) => Task.FromResult<IReadOnlyList<RpcCostCentreReportRow>>([]);
}
