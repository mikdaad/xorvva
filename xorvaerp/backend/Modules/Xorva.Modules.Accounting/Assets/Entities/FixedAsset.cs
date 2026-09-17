using Xorva.Core.Entities;

namespace Xorva.Modules.Accounting.Assets.Entities;

/// <summary>
/// A depreciable fixed asset (straight-line). The acquisition is assumed already booked
/// (e.g. via a bill to the asset account); this register drives monthly depreciation:
/// DR Depreciation Expense / CR Accumulated Depreciation.
/// </summary>
public class FixedAsset : CompanyEntity
{
    public string Name { get; set; } = string.Empty;
    public string? Code { get; set; }
    public string? Category { get; set; }

    public DateTime AcquisitionDate { get; set; }
    public decimal Cost { get; set; }
    public decimal SalvageValue { get; set; }
    public int UsefulLifeMonths { get; set; }

    public decimal AccumulatedDepreciation { get; set; }
    public bool IsDisposed { get; set; }

    // Posting targets (chosen from the chart at registration).
    public Guid AssetAccountId { get; set; }
    public Guid AccumulatedDepreciationAccountId { get; set; }
    public Guid DepreciationExpenseAccountId { get; set; }
}
