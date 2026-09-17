using Xorva.Core.Entities;

namespace Xorva.Modules.Accounting.Currency.Entities;

/// <summary>
/// A company-entered exchange rate: how many units of the company's BASE currency equal
/// one unit of <see cref="CurrencyCode"/>, effective from <see cref="RateDate"/>. A
/// document uses the latest rate on or before its date. The base currency itself is
/// always 1 and is never stored.
/// </summary>
public class ExchangeRate : CompanyEntity
{
    /// <summary>ISO 4217 code of the foreign currency, e.g. "USD".</summary>
    public string CurrencyCode { get; set; } = string.Empty;

    /// <summary>The date this rate takes effect (UTC, date only).</summary>
    public DateTime RateDate { get; set; }

    /// <summary>Base-currency units per 1 unit of <see cref="CurrencyCode"/> (e.g. 1 USD = 3.6725 AED).</summary>
    public decimal Rate { get; set; }
}
