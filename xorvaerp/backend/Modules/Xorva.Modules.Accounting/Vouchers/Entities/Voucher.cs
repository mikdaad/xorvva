using Xorva.Core.Entities;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.Vouchers.Entities;

/// <summary>
/// Unified Tally-style voucher (ported from TrueLedge <c>vouchers</c>). One header for every
/// document family — Contra / Payment / Receipt / Journal / Sales / Purchase — that the
/// F4–F9 entry screen produces.
///
/// OWNERSHIP: the table, its CHECK constraints, immutability triggers and numbering live in
/// <c>Sql/Accounting/0003_vouchers_and_ledger_invariants.sql</c>. This class is the EF
/// READ MODEL plus the draft-writer: EF creates and edits <see cref="VoucherStatus.Draft"/>
/// rows; posting and reversal go through the atomic RPCs (<c>accounting.post_voucher_atomic</c>,
/// <c>accounting.reverse_voucher</c>) which write the single ledger (JournalEntries/Lines) and
/// flip this row to Posted. Once posted the database rejects every edit except AmountPaid.
/// </summary>
public class Voucher : CompanyEntity
{
    public VoucherType VoucherType { get; set; }
    /// <summary>PREFIX-YEAR-NNNNN, allocated by accounting.generate_voucher_number.</summary>
    public string VoucherNumber { get; set; } = string.Empty;
    public VoucherStatus Status { get; set; } = VoucherStatus.Draft;

    public Guid? ContactId { get; set; }
    public DateOnly VoucherDate { get; set; }
    public DateOnly? DueDate { get; set; }
    public DateOnly? SupplyDate { get; set; }

    public string Currency { get; set; } = "AED";
    public decimal ExchangeRate { get; set; } = 1m;

    public decimal SubTotal { get; set; }
    public decimal DiscountTotal { get; set; }
    public decimal TaxTotal { get; set; }
    public decimal TotalAmount { get; set; }

    public decimal BaseSubTotal { get; set; }
    public decimal BaseDiscount { get; set; }
    public decimal BaseTaxTotal { get; set; }
    public decimal BaseTotalAmount { get; set; }

    public decimal AmountPaid { get; set; }
    /// <summary>GENERATED ALWAYS AS (TotalAmount - AmountPaid) STORED — read-only.</summary>
    public decimal? AmountDue { get; private set; }

    public string? Reference { get; set; }
    public string? Narration { get; set; }
    public string? TermsAndConditions { get; set; }
    public string? InternalNotes { get; set; }

    // UAE FTA fields
    public string? PlaceOfSupply { get; set; }
    public string? BuyerTrn { get; set; }
    public string? SellerTrn { get; set; }

    // Set by the posting RPC
    public Guid? FiscalPeriodId { get; set; }
    public Guid? JournalEntryId { get; set; }
    public DateTime? PostedAt { get; set; }
    public Guid? PostedBy { get; set; }

    // Links back to Xorva's existing documents when a voucher mirrors one
    public Guid? SourceInvoiceId { get; set; }
    public Guid? SourceBillId { get; set; }

    // Reversal chain (set by accounting.reverse_voucher)
    public Guid? ReversedById { get; set; }
    public Guid? ReversalOfId { get; set; }
    public string? ReversalReason { get; set; }

    public List<VoucherLine> Lines { get; set; } = [];
}

/// <summary>One row of a voucher (ported from TrueLedge <c>voucher_lines</c>).</summary>
public class VoucherLine : CompanyEntity
{
    public Guid VoucherId { get; set; }
    public int LineNumber { get; set; }

    public Guid? ProductId { get; set; }
    public Guid AccountId { get; set; }
    public string? Description { get; set; }

    /// <summary>"DR" or "CR" — which side of the ledger this line hits.</summary>
    public string DrCr { get; set; } = "DR";

    public decimal Quantity { get; set; } = 1m;
    public decimal UnitPrice { get; set; }
    public decimal DiscountPct { get; set; }
    public decimal LineAmount { get; set; }

    public Guid? TaxRateId { get; set; }
    public decimal TaxRatePercent { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal LineTotal { get; set; }

    public decimal BaseLineAmount { get; set; }
    public decimal BaseTaxAmount { get; set; }
    public decimal BaseLineTotal { get; set; }

    public Guid? CostCentreId { get; set; }
    public int SortOrder { get; set; }
}
