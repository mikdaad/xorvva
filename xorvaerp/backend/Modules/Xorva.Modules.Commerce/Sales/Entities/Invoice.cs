using Xorva.Core.Entities;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.Sales.Entities;

/// <summary>
/// A customer sales invoice. Created as a Draft, then Posted — posting produces the
/// auto-journal (DR Receivable / CR Revenue per line / CR VAT-Output) and locks the numbers.
/// </summary>
public class Invoice : CompanyEntity
{
    public string Number { get; set; } = string.Empty;   // INV-2026-0001
    public Guid ContactId { get; set; }
    public DateTime Date { get; set; }
    public DateTime DueDate { get; set; }
    public DocumentStatus Status { get; set; } = DocumentStatus.Draft;
    public string Currency { get; set; } = "AED";
    /// <summary>Base-currency units per 1 unit of <see cref="Currency"/> at issue (1 for base-currency invoices).</summary>
    public decimal ExchangeRate { get; set; } = 1m;

    // Amounts below are in the invoice's transaction Currency.
    public decimal SubTotal { get; set; }
    public decimal TaxTotal { get; set; }
    public decimal Total { get; set; }
    public decimal AmountPaid { get; set; }
    public decimal BalanceDue { get; set; }
    /// <summary>The invoice Total converted to base currency at posting (what hit the ledger / AR).</summary>
    public decimal BaseTotal { get; set; }

    /// <summary>The journal produced when this invoice was posted.</summary>
    public Guid? JournalEntryId { get; set; }
    public string? Notes { get; set; }

    public List<InvoiceLine> Lines { get; set; } = [];
}

public class InvoiceLine : CompanyEntity
{
    public Guid InvoiceId { get; set; }
    public string Description { get; set; } = string.Empty;
    public decimal Quantity { get; set; }
    public decimal UnitPrice { get; set; }

    /// <summary>Revenue account this line credits when posted.</summary>
    public Guid AccountId { get; set; }
    public Guid? TaxRateId { get; set; }
    public decimal TaxRatePercent { get; set; }   // snapshot of the rate at creation

    public decimal LineAmount { get; set; }        // Quantity * UnitPrice
    public decimal LineTax { get; set; }           // LineAmount * TaxRatePercent / 100
}
