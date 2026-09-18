using Xorva.Core.Entities;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.Contacts.Entities;

/// <summary>A customer or supplier (or both). Company-scoped. TRN captured for UAE e-invoicing.</summary>
public class Contact : CompanyEntity
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public ContactType ContactType { get; set; }

    /// <summary>Tax Registration Number (TRN) — required on tax invoices for VAT-registered parties.</summary>
    public string? TaxNumber { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }

    /// <summary>Default credit term in days (drives invoice/bill due dates).</summary>
    public int PaymentTermDays { get; set; } = 30;

    /// <summary>Cached balance the contact owes us (customer) or we owe them (supplier).</summary>
    public decimal OutstandingBalance { get; set; }

    public bool IsActive { get; set; } = true;

    // ── Party enrichment (ported from TrueLedge, Sql/Accounting/0005) ──
    public string? NameAr { get; set; }
    /// <summary>UAE VAT treatment; drives the default tax code on vouchers.</summary>
    public TaxTreatment TaxTreatment { get; set; } = TaxTreatment.Registered;
    /// <summary>Overrides the company-wide AR/AP control account for this party.</summary>
    public Guid? ControlAccountId { get; set; }
    public Guid? DefaultTaxRateId { get; set; }
    public decimal CreditLimit { get; set; }
    public string? ContactPerson { get; set; }
    public string? AddressLine1 { get; set; }
    public string? AddressLine2 { get; set; }
    public string? City { get; set; }
    /// <summary>ISO 3166-1 alpha-2. Non-AE parties are exempt from the 15-digit TRN check.</summary>
    public string Country { get; set; } = "AE";
}
