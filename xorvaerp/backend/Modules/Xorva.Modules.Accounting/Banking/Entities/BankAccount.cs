using Xorva.Core.Entities;

namespace Xorva.Modules.Accounting.Banking.Entities;

/// <summary>
/// A real-world bank/cash account, linked to a Bank-type account in the chart. Payments
/// flow through here so cash movements hit the right ledger account.
/// </summary>
public class BankAccount : CompanyEntity
{
    public string Name { get; set; } = string.Empty;

    /// <summary>The linked ledger account (must be an Asset / Bank or Cash account).</summary>
    public Guid AccountId { get; set; }

    public string? BankName { get; set; }
    public string? AccountNumber { get; set; }
    public string? Iban { get; set; }

    public bool IsActive { get; set; } = true;
}
