using Xorva.Core.Entities;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.Sales.Entities;

/// <summary>A sellable item / service used to speed up invoice lines. Company-scoped.</summary>
public class Product : CompanyEntity
{
    public string Name { get; set; } = string.Empty;
    public string? Code { get; set; }
    public decimal SalesPrice { get; set; }

    /// <summary>Revenue account this item posts to (defaults to the company's Sales account).</summary>
    public Guid? SalesAccountId { get; set; }
    public Guid? TaxRateId { get; set; }

    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;

    // ── Item enrichment (ported from TrueLedge, Sql/Accounting/0005) ──
    public string? NameAr { get; set; }
    public ItemType ItemType { get; set; } = ItemType.Service;
    public string UnitOfMeasure { get; set; } = "EA";
    public Guid? PurchaseAccountId { get; set; }
    public decimal? PurchasePrice { get; set; }
    public Guid? PurchaseTaxRateId { get; set; }
    public string? HsnCode { get; set; }
}
