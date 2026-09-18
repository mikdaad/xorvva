using System.Text.Json;
using Xorva.Modules.Accounting.Documents.Entities;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.DTOs;

public record InboxDocumentDto
{
    public Guid Id { get; init; }
    public Guid FileId { get; init; }
    public string FileName { get; init; } = string.Empty;
    public string MimeType { get; init; } = string.Empty;
    public long? FileSize { get; init; }
    public int? PageCount { get; init; }
    public List<string> Tags { get; init; } = [];
    public InboxDocumentStatus Status { get; init; }
    public string? StatusMessage { get; init; }
    public DocumentKind DocumentKind { get; init; }
    public Guid? CreatedVoucherId { get; init; }
    public string? CreatedVoucherNumber { get; init; }
    public DateTime UploadedAt { get; init; }
    public Guid? UploadedBy { get; init; }
    public DateTime? ProcessedAt { get; init; }
    /// <summary>Latest extraction's overall confidence (0–1), when extracted.</summary>
    public decimal? ConfidenceScore { get; init; }
    public string? SupplierName { get; init; }
    public string? InvoiceNumber { get; init; }
    public decimal? GrandTotal { get; init; }
}

public record DocumentFieldSuggestionDto
{
    public Guid Id { get; init; }
    public string FieldName { get; init; } = string.Empty;
    public string? FieldGroup { get; init; }
    public string? ExtractedValue { get; init; }
    public decimal Confidence { get; init; }
    /// <summary>high ≥ 0.85 · medium ≥ 0.60 · low</summary>
    public string ConfidenceLevel { get; init; } = "low";
    public string? UserOverride { get; init; }
    public string? FinalValue { get; init; }
}

public record DocumentExtractionDto
{
    public Guid Id { get; init; }
    public Guid DocumentId { get; init; }
    public string ModelUsed { get; init; } = string.Empty;
    public string? ModelVersion { get; init; }
    public int? ProcessingTimeMs { get; init; }
    /// <summary>The structured invoice (snake_case keys, TrueLedge ExtractedInvoice shape).</summary>
    public JsonElement ExtractedData { get; init; }
    public decimal ConfidenceScore { get; init; }
    public string ConfidenceLevel { get; init; } = "low";
    public bool IsAccepted { get; init; }
    public DateTime? AcceptedAt { get; init; }
    public Guid? CreatedVoucherId { get; init; }
    public List<DocumentFieldSuggestionDto> Fields { get; init; } = [];
}

public record InboxDocumentDetailDto
{
    public InboxDocumentDto Document { get; init; } = new();
    public DocumentExtractionDto? Extraction { get; init; }
    /// <summary>Whether a vision provider is configured; the UI hides "Extract" when false.</summary>
    public bool ExtractionAvailable { get; init; }
}

public static class DocumentInboxMappers
{
    public static string ConfidenceLevel(decimal score) => score >= 0.85m ? "high" : score >= 0.60m ? "medium" : "low";

    public static InboxDocumentDto ToDto(this AccountingDocument d, DocumentExtraction? latest = null, string? voucherNumber = null)
    {
        string? supplier = null, invoiceNo = null; decimal? total = null;
        if (latest is not null)
        {
            try
            {
                using var doc = JsonDocument.Parse(latest.ExtractedData);
                var r = doc.RootElement;
                supplier = r.TryGetProperty("supplier_name", out var s) && s.ValueKind == JsonValueKind.String ? s.GetString() : null;
                invoiceNo = r.TryGetProperty("invoice_number", out var n) && n.ValueKind == JsonValueKind.String ? n.GetString() : null;
                total = r.TryGetProperty("grand_total", out var g) && g.ValueKind == JsonValueKind.Number ? g.GetDecimal() : null;
            }
            catch (JsonException) { /* tolerate malformed stored JSON */ }
        }
        return new InboxDocumentDto
        {
            Id = d.Id, FileId = d.FileId, FileName = d.FileName, MimeType = d.MimeType, FileSize = d.FileSize, PageCount = d.PageCount,
            Tags = d.Tags ?? [], Status = d.Status, StatusMessage = d.StatusMessage, DocumentKind = d.DocumentKind,
            CreatedVoucherId = d.CreatedVoucherId, CreatedVoucherNumber = voucherNumber, UploadedAt = d.UploadedAt, UploadedBy = d.UploadedBy,
            ProcessedAt = d.ProcessedAt, ConfidenceScore = latest?.ConfidenceScore, SupplierName = supplier, InvoiceNumber = invoiceNo, GrandTotal = total,
        };
    }

    public static DocumentFieldSuggestionDto ToDto(this DocumentFieldSuggestion f) => new()
    {
        Id = f.Id, FieldName = f.FieldName, FieldGroup = f.FieldGroup, ExtractedValue = f.ExtractedValue, Confidence = f.Confidence,
        ConfidenceLevel = ConfidenceLevel(f.Confidence), UserOverride = f.UserOverride, FinalValue = f.FinalValue ?? f.UserOverride ?? f.ExtractedValue,
    };

    public static DocumentExtractionDto ToDto(this DocumentExtraction e, IEnumerable<DocumentFieldSuggestion> fields)
    {
        JsonElement data;
        try { data = JsonDocument.Parse(e.ExtractedData).RootElement.Clone(); }
        catch (JsonException) { data = JsonDocument.Parse("{}").RootElement.Clone(); }
        return new DocumentExtractionDto
        {
            Id = e.Id, DocumentId = e.DocumentId, ModelUsed = e.ModelUsed, ModelVersion = e.ModelVersion, ProcessingTimeMs = e.ProcessingTimeMs,
            ExtractedData = data, ConfidenceScore = e.ConfidenceScore, ConfidenceLevel = ConfidenceLevel(e.ConfidenceScore),
            IsAccepted = e.IsAccepted, AcceptedAt = e.AcceptedAt, CreatedVoucherId = e.CreatedVoucherId,
            Fields = [.. fields.OrderBy(f => f.FieldGroup == "header" ? 0 : f.FieldGroup == "line_item" ? 1 : 2).ThenBy(f => f.FieldName).Select(f => f.ToDto())],
        };
    }
}
