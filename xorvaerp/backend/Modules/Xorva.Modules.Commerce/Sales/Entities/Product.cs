using Xorva.Core.Entities;

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
}
