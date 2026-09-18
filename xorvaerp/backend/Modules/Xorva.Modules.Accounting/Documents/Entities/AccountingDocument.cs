using Xorva.Core.Entities;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.Documents.Entities;

/// <summary>
/// Raw bytes of an uploaded invoice/receipt (ported from TrueLedge's Supabase Storage bucket —
/// Xorva stores documents in PostgreSQL like <c>HrFiles</c>). Written by
/// <c>accounting.upload_document</c>; DDL/RLS in <c>Sql/Accounting/0006_ai_documents.sql</c>.
/// </summary>
public class AccountingDocumentFile : CompanyEntity
{
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long Size { get; set; }
    public string? Sha256 { get; set; }
    public byte[] Data { get; set; } = [];
}

/// <summary>An inbox item: one uploaded document and its AI-processing lifecycle (ported from <c>documents</c>).</summary>
public class AccountingDocument : CompanyEntity
{
    public Guid FileId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string MimeType { get; set; } = string.Empty;
    public long? FileSize { get; set; }
    public int? PageCount { get; set; }
    public List<string>? Tags { get; set; }

    /// <summary>Pending → Processing → Extracted → Accepted | Rejected; Failed may retry. Enforced by trigger.</summary>
    public InboxDocumentStatus Status { get; set; } = InboxDocumentStatus.Pending;
    public string? StatusMessage { get; set; }
    public DocumentKind DocumentKind { get; set; } = DocumentKind.PurchaseInvoice;

    /// <summary>The voucher created when the extraction was accepted.</summary>
    public Guid? CreatedVoucherId { get; set; }

    public DateTime UploadedAt { get; set; }
    public Guid? UploadedBy { get; set; }
    public DateTime? ProcessedAt { get; set; }
}

/// <summary>One Gemini run over a document (ported from <c>document_extractions</c>).</summary>
public class DocumentExtraction : CompanyEntity
{
    public Guid DocumentId { get; set; }
    public string ModelUsed { get; set; } = "gemini-2.5-flash";
    public string? ModelVersion { get; set; }
    public int? ProcessingTimeMs { get; set; }
    /// <summary>JSONB — the model's raw structured output.</summary>
    public string? RawResponse { get; set; }
    /// <summary>JSONB — normalised ExtractedInvoice (see GeminiInvoiceExtractor).</summary>
    public string ExtractedData { get; set; } = "{}";
    /// <summary>0..1 overall confidence.</summary>
    public decimal ConfidenceScore { get; set; }
    public Guid? CreatedVoucherId { get; set; }
    public bool IsAccepted { get; set; }
    public DateTime? AcceptedAt { get; set; }
    public Guid? AcceptedBy { get; set; }

    public List<DocumentFieldSuggestion> Fields { get; set; } = [];
}

/// <summary>A single extracted field with its confidence and the user's override (ported from <c>document_field_suggestions</c>).</summary>
public class DocumentFieldSuggestion : CompanyEntity
{
    public Guid ExtractionId { get; set; }
    /// <summary>supplier_name, invoice_number, grand_total, line_items[0].amount …</summary>
    public string FieldName { get; set; } = string.Empty;
    /// <summary>header | line_item | totals</summary>
    public string? FieldGroup { get; set; }
    public string? ExtractedValue { get; set; }
    public decimal Confidence { get; set; }
    public string? UserOverride { get; set; }
    /// <summary>COALESCE(UserOverride, ExtractedValue) — maintained by trigger.</summary>
    public string? FinalValue { get; set; }
}
