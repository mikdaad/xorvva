using Xorva.Core.Entities;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.Sales.Entities;

/// <summary>
/// A sales credit note (customer return / adjustment). Posts the reverse of a sale:
/// DR Revenue per line · DR VAT-Output · CR Receivable — reducing what the customer owes.
/// </summary>
public class CreditNote : CompanyEntity
{
    public string Number { get; set; } = string.Empty;   // CN-2026-0001
    public Guid ContactId { get; set; }
    public Guid? InvoiceId { get; set; }                  // optional link to the original invoice
    public DateTime Date { get; set; }
    public DocumentStatus Status { get; set; } = DocumentStatus.Posted;
    public string Currency { get; set; } = "AED";

    public decimal SubTotal { get; set; }
    public decimal TaxTotal { get; set; }
    public decimal Total { get; set; }

    public Guid? JournalEntryId { get; set; }
    public string? Reason { get; set; }

    public List<CreditNoteLine> Lines { get; set; } = [];
}

public class CreditNoteLine : CompanyEntity
{
    public Guid CreditNoteId { get; set; }
    public string Description { get; set; } = string.Empty;
    public decimal Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public Guid AccountId { get; set; }
    public Guid? TaxRateId { get; set; }
    public decimal TaxRatePercent { get; set; }
    public decimal LineAmount { get; set; }
    public decimal LineTax { get; set; }
}
