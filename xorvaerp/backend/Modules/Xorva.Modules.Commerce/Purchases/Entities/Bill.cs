using Xorva.Core.Entities;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.Purchases.Entities;

/// <summary>
/// A supplier bill (accounts payable). The mirror of an Invoice: posting produces
/// DR Expense per line / DR VAT-Input / CR Payable, and it is settled by supplier payments.
/// </summary>
public class Bill : CompanyEntity
{
    public string Number { get; set; } = string.Empty;   // BILL-2026-0001
    public string? SupplierReference { get; set; }        // the supplier's own invoice no.
    public Guid ContactId { get; set; }                   // the supplier
    public DateTime Date { get; set; }
    public DateTime DueDate { get; set; }
    public DocumentStatus Status { get; set; } = DocumentStatus.Draft;
    public string Currency { get; set; } = "AED";
    /// <summary>Base-currency units per 1 unit of <see cref="Currency"/> at entry (1 for base-currency bills).</summary>
    public decimal ExchangeRate { get; set; } = 1m;

    // Amounts below are in the bill's transaction Currency.
    public decimal SubTotal { get; set; }
    public decimal TaxTotal { get; set; }
    public decimal Total { get; set; }
    public decimal AmountPaid { get; set; }
    public decimal BalanceDue { get; set; }
    /// <summary>The bill Total converted to base currency at posting (what hit the ledger / AP).</summary>
    public decimal BaseTotal { get; set; }

    public Guid? JournalEntryId { get; set; }
    public string? Notes { get; set; }

    public List<BillLine> Lines { get; set; } = [];
}

public class BillLine : CompanyEntity
{
    public Guid BillId { get; set; }
    public string Description { get; set; } = string.Empty;
    public decimal Quantity { get; set; }
    public decimal UnitPrice { get; set; }

    /// <summary>Expense (or asset) account this line debits when posted.</summary>
    public Guid AccountId { get; set; }
    public Guid? TaxRateId { get; set; }
    public decimal TaxRatePercent { get; set; }

    public decimal LineAmount { get; set; }
    public decimal LineTax { get; set; }
}
