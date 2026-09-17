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
}
