using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.Ledger.Entities;

/// <summary>
/// A posted double-entry transaction — the immutable heart of the ledger. Its lines always
/// balance (Σdebit == Σcredit). Corrections are made by a reversing entry, never by edit.
/// </summary>
public class JournalEntry : CompanyEntity
{
    public string EntryNumber { get; set; } = string.Empty;   // JV-2026-0001
    public DateTime Date { get; set; }
    public string Description { get; set; } = string.Empty;

    public JournalSourceType SourceType { get; set; }         // Core enum — Manual, Invoice, Reversal…
    /// <summary>The source document (invoice/bill/payment) or, for a reversal, the entry being reversed.</summary>
    public Guid? SourceId { get; set; }

    public JournalStatus Status { get; set; } = JournalStatus.Posted;
    public DateTime? PostedAt { get; set; }
    public Guid? PostedBy { get; set; }

    public decimal TotalDebit { get; set; }
    public decimal TotalCredit { get; set; }

    /// <summary>The voucher that produced this entry (null for entries posted by JournalPoster). Sql/Accounting/0003.</summary>
    public Guid? VoucherId { get; set; }
    /// <summary>The reversing entry that voided this one (set by accounting.reverse_voucher).</summary>
    public Guid? ReversedById { get; set; }

    public List<JournalLine> Lines { get; set; } = [];
}

/// <summary>One side of a journal entry: a debit or a credit against a single account.</summary>
public class JournalLine : CompanyEntity
{
    public Guid JournalEntryId { get; set; }
    public Guid AccountId { get; set; }
    public decimal Debit { get; set; }
    public decimal Credit { get; set; }
    public Guid? ContactId { get; set; }
    public Guid? TaxRateId { get; set; }
    public string? Description { get; set; }

    /// <summary>Bank reconciliation flag — set when this line is matched to a bank statement.</summary>
    public bool IsReconciled { get; set; }

    /// <summary>Leaf cost centre this line is tagged to (Sql/Accounting/0002). Groups are rejected by trigger.</summary>
    public Guid? CostCentreId { get; set; }
}
