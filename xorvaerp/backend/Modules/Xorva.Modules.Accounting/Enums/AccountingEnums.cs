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

// ═══════════════════════════════════════════════════════════════════════════
// Ported from TrueLedge (Sql/Accounting/0002–0006). String-converted in EF; the
// literal names MUST match the CHECK constraints in the SQL scripts exactly.
// ═══════════════════════════════════════════════════════════════════════════

/// <summary>Tally-style voucher families. Prefixes: SI PB CN DN RV PV JV CT OB (accounting.voucher_prefix).</summary>
public enum VoucherType
{
    SalesInvoice = 0,
    PurchaseBill = 1,
    CreditNote = 2,
    DebitNote = 3,
    Receipt = 4,        // F6 — money in
    Payment = 5,        // F5 — money out
    Journal = 6,        // F7 — free Dr/Cr grid
    Contra = 7,         // F4 — bank ↔ cash / bank ↔ bank
    OpeningBalance = 8
}

public enum VoucherStatus
{
    Draft = 0,
    Submitted = 1,
    Posted = 2,
    Reversed = 3,
    Cancelled = 4
}

public enum CostCentreDimensionType
{
    Project = 0,
    Department = 1,
    Location = 2,
    Activity = 3,
    Segment = 4,
    Custom = 5
}

/// <summary>Soft close = only Company Admin+ may post adjustments; hard close = nobody.</summary>
public enum PeriodCloseStatus
{
    Open = 0,
    SoftClosed = 1,
    HardClosed = 2
}

public enum TaxTreatment
{
    Registered = 0,
    Unregistered = 1,
    DesignatedZone = 2,
    Exempt = 3,
    ReverseCharge = 4
}

public enum ItemType
{
    Inventory = 0,
    Service = 1,
    Expense = 2,
    FixedAsset = 3
}

public enum TaxScope
{
    VAT = 0,
    CorporateTax = 1,
    Excise = 2,
    Withholding = 3
}

public enum BankImportStatus
{
    Pending = 0,
    Processing = 1,
    Completed = 2,
    Failed = 3,
    PartiallyCompleted = 4
}

public enum BankMatchStatus
{
    Unmatched = 0,
    Suggested = 1,
    Matched = 2,
    Ignored = 3
}

public enum BankMatchPatternField
{
    Description = 0,
    Reference = 1,
    ChequeNumber = 2
}

/// <summary>AI inbox document lifecycle (AccountingDocuments.Status CHECK literals). Distinct from the trade-document <see cref="DocumentStatus"/>.</summary>
public enum InboxDocumentStatus
{
    Pending = 0,
    Processing = 1,
    Extracted = 2,
    Accepted = 3,
    Rejected = 4,
    Failed = 5
}

public enum DocumentKind
{
    PurchaseInvoice = 0,
    SalesInvoice = 1,
    Receipt = 2,
    Other = 3
}
