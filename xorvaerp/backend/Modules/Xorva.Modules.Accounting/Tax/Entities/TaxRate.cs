using Xorva.Core.Entities;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.Tax.Entities;

/// <summary>
/// A VAT/tax rate. Links to the VAT-Output account (tax collected on sales) and the
/// VAT-Input account (tax paid on purchases) so invoices/bills post tax to the right place.
/// </summary>
public class TaxRate : CompanyEntity
{
    public string Name { get; set; } = string.Empty;   // "VAT 5%", "Zero-rated", "Exempt"
    public decimal Rate { get; set; }                   // percentage, e.g. 5.00 = 5%
    public TaxAppliesTo AppliesTo { get; set; }
    public Guid? OutputAccountId { get; set; }          // VAT payable (on sales)
    public Guid? InputAccountId { get; set; }           // VAT recoverable (on purchases)
    public bool IsActive { get; set; } = true;
}
