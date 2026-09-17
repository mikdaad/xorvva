namespace Xorva.Modules.Accounting.DTOs;

/// <summary>The seller's tax identity used when generating e-invoices (UBL / PINT AE).</summary>
public record EInvoicingSettingsDto
{
    public string? LegalName { get; init; }
    public string? TaxRegistrationNumber { get; init; }
    public string? AddressLine { get; init; }
    public string? City { get; init; }
    public string CountryCode { get; init; } = "AE";
    /// <summary>The company's own name — shown as the fallback legal name.</summary>
    public string CompanyName { get; init; } = string.Empty;
}

/// <summary>A generated e-invoice document plus any compliance warnings.</summary>
public record EInvoiceDto
{
    public string FileName { get; init; } = string.Empty;
    public string Format { get; init; } = "UBL 2.1 (PINT AE)";
    public string Xml { get; init; } = string.Empty;
    /// <summary>Non-blocking notes about data that a fully compliant filing would need (e.g. missing TRN).</summary>
    public List<string> Warnings { get; init; } = [];
}
