using Xorva.Core.Entities;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.Ledger.Entities;

/// <summary>An accounting year (e.g. FY2026). Closing it rolls P&amp;L into Retained Earnings.</summary>
public class FiscalYear : CompanyEntity
{
    public string Name { get; set; } = string.Empty;
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public bool IsClosed { get; set; }
}

/// <summary>A period within a fiscal year (typically a calendar month). Posting into a closed period is rejected.</summary>
public class FiscalPeriod : CompanyEntity
{
    public Guid FiscalYearId { get; set; }
    public string Name { get; set; } = string.Empty;
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    /// <summary>Legacy flag, kept in sync with <see cref="CloseStatus"/> by a DB trigger (true ⇔ not Open).</summary>
    public bool IsClosed { get; set; }

    // ── Soft / hard close (ported from TrueLedge, Sql/Accounting/0005) ──
    /// <summary>Open · SoftClosed (Company Admin+ may still post adjustments) · HardClosed (nobody).</summary>
    public PeriodCloseStatus CloseStatus { get; set; } = PeriodCloseStatus.Open;
    public DateTime? ClosedAt { get; set; }
    public Guid? ClosedBy { get; set; }
}
