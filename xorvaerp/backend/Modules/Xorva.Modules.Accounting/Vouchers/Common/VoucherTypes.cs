using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.Vouchers.Common;

/// <summary>How a voucher family is entered and turned into ledger lines (ported from TrueLedge voucher-types.ts).</summary>
public enum VoucherMode
{
    /// <summary>Contra / Payment / Receipt — two-ledger money movement, no tax.</summary>
    Settlement,
    /// <summary>Journal — free Dr/Cr grid.</summary>
    Journal,
    /// <summary>Sales / Purchase — item lines with VAT and a balancing party (control-account) line.</summary>
    Invoice
}

public enum TradeDirection { Inward, Outward }

/// <summary>Static description of one Tally voucher family — function key, mode, party rules, prefix.</summary>
public sealed record VoucherTypeConfig(
    VoucherType Type,
    string Shortcut,
    string Label,
    string Description,
    VoucherMode Mode,
    bool RequiresParty,
    TradeDirection? Direction,
    string Prefix);

/// <summary>The F4–F9 catalogue. Prefixes MUST agree with <c>accounting.voucher_prefix</c> (Sql/Accounting/0003).</summary>
public static class VoucherTypes
{
    public static readonly IReadOnlyList<VoucherTypeConfig> All =
    [
        new(VoucherType.Contra,       "F4", "Contra",   "Move money between bank and cash ledgers.",                    VoucherMode.Settlement, false, null,                    "CT"),
        new(VoucherType.Payment,      "F5", "Payment",  "Money going out — supplier bills, expenses, salaries.",         VoucherMode.Settlement, false, TradeDirection.Outward,  "PV"),
        new(VoucherType.Receipt,      "F6", "Receipt",  "Money coming in — customer collections, refunds, deposits.",    VoucherMode.Settlement, false, TradeDirection.Inward,   "RV"),
        new(VoucherType.Journal,      "F7", "Journal",  "Adjustments, accruals, provisions — any Dr/Cr entry.",          VoucherMode.Journal,    false, null,                    "JV"),
        new(VoucherType.SalesInvoice, "F8", "Sales",    "Tax invoice to a customer with VAT lines.",                     VoucherMode.Invoice,    true,  TradeDirection.Outward,  "SI"),
        new(VoucherType.PurchaseBill, "F9", "Purchase", "Supplier tax invoice with recoverable input VAT.",              VoucherMode.Invoice,    true,  TradeDirection.Inward,   "PB"),
        // Not entered through the F-key screen, but they are valid voucher rows (reversals, migrated notes, opening balances).
        new(VoucherType.CreditNote,   "",   "Credit Note",     "Credit issued against a sales invoice.",                 VoucherMode.Invoice,    true,  TradeDirection.Inward,   "CN"),
        new(VoucherType.DebitNote,    "",   "Debit Note",      "Debit raised against a supplier bill.",                  VoucherMode.Invoice,    true,  TradeDirection.Outward,  "DN"),
        new(VoucherType.OpeningBalance, "", "Opening Balance", "Books-beginning balances.",                             VoucherMode.Journal,    false, null,                    "OB"),
    ];

    private static readonly Dictionary<VoucherType, VoucherTypeConfig> ByType = All.ToDictionary(v => v.Type);

    public static VoucherTypeConfig For(VoucherType type) => ByType[type];

    /// <summary>The six families the entry screen offers (F4–F9), in key order.</summary>
    public static IEnumerable<VoucherTypeConfig> EntryTypes => All.Where(v => v.Shortcut.Length > 0);
}
