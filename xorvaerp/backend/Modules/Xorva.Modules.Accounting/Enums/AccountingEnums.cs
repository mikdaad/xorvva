namespace Xorva.Modules.Accounting.Enums;

/// <summary>The five universal account classes. Every account rolls up to one of these.</summary>
public enum AccountType
{
    Asset = 0,
    Liability = 1,
    Equity = 2,
    Revenue = 3,
    Expense = 4
}

/// <summary>
/// Finer classification used to (a) resolve system accounts for auto-journals
/// (AR, AP, Bank, VAT…) and (b) group lines on the statements.
/// </summary>
public enum AccountSubType
{
    // ── Assets ──
    Bank = 0,
    Cash = 1,
    AccountsReceivable = 2,
    TaxReceivable = 3,          // recoverable input VAT
    Inventory = 4,
    OtherCurrentAsset = 5,
    FixedAsset = 6,
    OtherAsset = 7,

    // ── Liabilities ──
    AccountsPayable = 20,
    TaxPayable = 21,            // output VAT collected
    OtherCurrentLiability = 22,
    LongTermLiability = 23,

    // ── Equity ──
    Equity = 40,
    RetainedEarnings = 41,

    // ── Revenue ──
    Revenue = 60,
    OtherIncome = 61,

    // ── Expense ──
    CostOfGoodsSold = 80,
    OperatingExpense = 81,
    OtherExpense = 82
}

/// <summary>Which side increases the account. Asset/Expense = Debit; Liability/Equity/Revenue = Credit.</summary>
public enum NormalBalance
{
    Debit = 0,
    Credit = 1
}

/// <summary>Lifecycle of a journal entry. Posted entries are immutable (void → reversal).</summary>
public enum JournalStatus
{
    Draft = 0,
    Posted = 1,
    Voided = 2
}

/// <summary>Whether a contact is a customer, a supplier, or both.</summary>
public enum ContactType
{
    Customer = 0,
    Supplier = 1,
    Both = 2
}

/// <summary>Which side of trade a tax rate applies to.</summary>
public enum TaxAppliesTo
{
    Sales = 0,
    Purchase = 1,
    Both = 2
}

/// <summary>How a payment was made.</summary>
public enum PaymentMethod
{
    Bank = 0,
    Cash = 1,
    Cheque = 2,
    Card = 3,
    Online = 4
}

/// <summary>Lifecycle of a trade document (invoice / bill).</summary>
public enum DocumentStatus
{
    Draft = 0,
    Posted = 1,
    PartiallyPaid = 2,
    Paid = 3,
    Voided = 4
}
