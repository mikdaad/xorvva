using System.Text.Json;

namespace Xorva.Modules.Accounting.Documents.Services;

/// <summary>Masters handed to the model so it can return matched_party_id / matched_item_id / matched_account_id (TrueLedge <c>AvailableMasters</c>).</summary>
public sealed record ExtractionMasters(
    IReadOnlyList<ExtractionMasterParty> Parties,
    IReadOnlyList<ExtractionMasterItem> Items,
    IReadOnlyList<ExtractionMasterAccount> Accounts);

public sealed record ExtractionMasterParty(Guid Id, string Name, string? Trn);
public sealed record ExtractionMasterItem(Guid Id, string Name, Guid? PurchaseAccountId, Guid? TaxRateId);
public sealed record ExtractionMasterAccount(Guid Id, string Name);

/// <summary>
/// Outcome of one model call. <see cref="ExtractedJson"/> is the structured invoice object (snake_case keys per
/// TrueLedge's INVOICE_SCHEMA — the 0006 RPC reads those keys verbatim); <see cref="RawResponseJson"/> is the
/// provider's full response for audit.
/// </summary>
public sealed record DocumentExtractionResult(
    bool Success,
    JsonElement? ExtractedJson,
    string? RawResponseJson,
    string ModelUsed,
    string? ModelVersion,
    int ProcessingTimeMs,
    string? Error);

/// <summary>
/// Vision-model gateway for the AI document inbox. The Accounting module owns the interface; Infrastructure
/// supplies the Gemini implementation. Implementations MUST NOT create or post anything — extraction only;
/// a human accepts the draft (TrueLedge safety rule).
/// </summary>
public interface IDocumentExtractor
{
    /// <summary>False when no provider key is configured — the inbox then stores documents without extracting.</summary>
    bool IsConfigured { get; }

    Task<DocumentExtractionResult> ExtractInvoiceAsync(byte[] content, string mimeType, ExtractionMasters? masters, CancellationToken ct);
}
