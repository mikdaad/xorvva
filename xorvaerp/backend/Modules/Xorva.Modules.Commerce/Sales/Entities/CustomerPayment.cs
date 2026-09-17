using Xorva.Core.Entities;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.Sales.Entities;

/// <summary>
/// Money received from a customer. Posting produces DR Bank / CR Receivable and allocates
/// the amount across one or more posted invoices, settling their balances.
/// </summary>
public class CustomerPayment : CompanyEntity
{
    public string Number { get; set; } = string.Empty;   // PMT-2026-0001
    public Guid ContactId { get; set; }
    public DateTime Date { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "AED";
    /// <summary>Base-currency units per 1 unit of <see cref="Currency"/> on the payment date (1 for base).</summary>
    public decimal ExchangeRate { get; set; } = 1m;

    /// <summary>The bank/cash account the money landed in.</summary>
    public Guid BankAccountId { get; set; }
    public PaymentMethod Method { get; set; }
    public Guid? JournalEntryId { get; set; }
    public string? Reference { get; set; }

    public List<PaymentAllocation> Allocations { get; set; } = [];
}

public class PaymentAllocation : CompanyEntity
{
    public Guid CustomerPaymentId { get; set; }
    public Guid InvoiceId { get; set; }
    public decimal Amount { get; set; }
}
