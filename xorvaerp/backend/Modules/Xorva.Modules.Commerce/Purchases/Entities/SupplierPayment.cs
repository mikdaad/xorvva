using Xorva.Core.Entities;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.Purchases.Entities;

/// <summary>Money paid to a supplier. Posting produces DR Payable / CR Bank, settling bills.</summary>
public class SupplierPayment : CompanyEntity
{
    public string Number { get; set; } = string.Empty;   // PMT-2026-0001 (shares the payment sequence)
    public Guid ContactId { get; set; }
    public DateTime Date { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "AED";
    /// <summary>Base-currency units per 1 unit of <see cref="Currency"/> on the payment date (1 for base).</summary>
    public decimal ExchangeRate { get; set; } = 1m;
    public Guid BankAccountId { get; set; }
    public PaymentMethod Method { get; set; }
    public Guid? JournalEntryId { get; set; }
    public string? Reference { get; set; }

    public List<BillPaymentAllocation> Allocations { get; set; } = [];
}

public class BillPaymentAllocation : CompanyEntity
{
    public Guid SupplierPaymentId { get; set; }
    public Guid BillId { get; set; }
    public decimal Amount { get; set; }
}
