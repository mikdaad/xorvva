using Xorva.Core.Entities;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.Ledger.Entities;

/// <summary>
/// A single line in the Chart of Accounts — company-scoped (auto tenant isolation).
/// Accounts form a tree via <see cref="ParentAccountId"/>. System accounts are seeded
/// from the industry template and cannot be deleted (only deactivated).
/// </summary>
public class Account : CompanyEntity
{
    /// <summary>Ledger code, e.g. "1100". Unique per company.</summary>
    public string Code { get; set; } = string.Empty;

    /// <summary>Display name, e.g. "Accounts Receivable".</summary>
    public string Name { get; set; } = string.Empty;

    public AccountType AccountType { get; set; }
    public AccountSubType AccountSubType { get; set; }

    /// <summary>Debit or Credit — the side that increases this account (derived from type, stored for reporting).</summary>
    public NormalBalance NormalBalance { get; set; }

    /// <summary>Parent for sub-accounts (tree). Same company only.</summary>
    public Guid? ParentAccountId { get; set; }

    public string? Description { get; set; }

    /// <summary>Seeded/system account (AR, AP, VAT, Retained Earnings…). Cannot be deleted, only deactivated.</summary>
    public bool IsSystemAccount { get; set; }

    /// <summary>
    /// Denormalised running balance — a CACHE only. The source of truth is the sum of
    /// posted <c>JournalLine</c> rows; reports compute from the lines.
    /// </summary>
    public decimal CurrentBalance { get; set; }

    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }

    // ── Tally ledger attributes (ported from TrueLedge, Sql/Accounting/0005) ──
    public string? NameAr { get; set; }
    /// <summary>Group ledgers organise the chart and cannot be posted to (DB trigger).</summary>
    public bool IsGroup { get; set; }
    /// <summary>AR/AP control account — derived from the sub-type by trigger, kept for the UI.</summary>
    public bool IsControl { get; set; }
    /// <summary>Reconcilable bank ledger — derived from the sub-type by trigger.</summary>
    public bool IsBank { get; set; }
    public string? PartyTrn { get; set; }
    public string? PlaceOfSupply { get; set; }
    public Guid? DefaultTaxRateId { get; set; }
}
