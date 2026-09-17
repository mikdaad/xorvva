using Xorva.Core.Entities;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.Purchases.Entities;

/// <summary>
/// A purchase debit note (return to / adjustment from a supplier). Posts the reverse of a
/// purchase: DR Payable · CR Expense per line · CR VAT-Input — reducing what we owe the supplier.
/// </summary>
public class DebitNote : CompanyEntity
{
    public string Number { get; set; } = string.Empty;   // DN-2026-0001
    public Guid ContactId { get; set; }
    public Guid? BillId { get; set; }                     // optional link to the original bill
    public DateTime Date { get; set; }
    public DocumentStatus Status { get; set; } = DocumentStatus.Posted;
    public string Currency { get; set; } = "AED";

    public decimal SubTotal { get; set; }
    public decimal TaxTotal { get; set; }
    public decimal Total { get; set; }

    public Guid? JournalEntryId { get; set; }
    public string? Reason { get; set; }

    public List<DebitNoteLine> Lines { get; set; } = [];
}

public class DebitNoteLine : CompanyEntity
{
    public Guid DebitNoteId { get; set; }
    public string Description { get; set; } = string.Empty;
    public decimal Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public Guid AccountId { get; set; }
    public Guid? TaxRateId { get; set; }
    public decimal TaxRatePercent { get; set; }
    public decimal LineAmount { get; set; }
    public decimal LineTax { get; set; }
}
