using Microsoft.EntityFrameworkCore;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Currency.Entities;

namespace Xorva.Modules.Accounting.Currency.Common;

/// <summary>Resolves the base-per-foreign exchange rate for a document.</summary>
public static class ExchangeRateResolver
{
    /// <summary>Normalizes a currency code (trim + upper); blank falls back to the base currency.</summary>
    public static string Normalize(string? code, string baseCurrency) =>
        string.IsNullOrWhiteSpace(code) ? baseCurrency : code.Trim().ToUpperInvariant();

    public static bool IsBase(string currency, string baseCurrency) =>
        string.Equals(currency, baseCurrency, StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// The rate to use for <paramref name="currency"/> on <paramref name="date"/>: the base currency
    /// is always 1; otherwise the latest company rate on or before the date. An explicit
    /// <paramref name="requested"/> rate (from the document) wins when supplied and positive.
    /// </summary>
    public static async Task<decimal> ResolveAsync(
        IXorvaDbContext db, Guid companyId, string currency, string baseCurrency,
        DateTime date, decimal? requested, CancellationToken ct)
    {
        if (IsBase(currency, baseCurrency)) return 1m;
        if (requested is > 0m) return requested.Value;

        var rate = await db.Set<ExchangeRate>()
            .Where(r => r.CompanyId == companyId && r.CurrencyCode == currency && r.RateDate <= date)
            .OrderByDescending(r => r.RateDate)
            .Select(r => (decimal?)r.Rate)
            .FirstOrDefaultAsync(ct);

        return rate ?? throw new BadRequestException(
            $"No exchange rate for {currency} on or before {date:yyyy-MM-dd}. Add one under Exchange Rates, or enter a rate on the document.");
    }
}
