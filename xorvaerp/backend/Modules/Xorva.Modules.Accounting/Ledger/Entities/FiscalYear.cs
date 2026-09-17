using Xorva.Core.Entities;

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
    public bool IsClosed { get; set; }
}
