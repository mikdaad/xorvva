using Xorva.Modules.Accounting.Currency.Entities;

namespace Xorva.Modules.Accounting.DTOs;

public record ExchangeRateDto
{
    public Guid Id { get; init; }
    public string CurrencyCode { get; init; } = string.Empty;
    public DateTime RateDate { get; init; }
    public decimal Rate { get; init; }
}

/// <summary>Outcome of a period-end FX revaluation run.</summary>
public record FxRevaluationResultDto
{
    public DateTime AsOfDate { get; init; }
    /// <summary>Net unrealized P&amp;L impact in base currency (positive = gain, negative = loss).</summary>
    public decimal NetUnrealized { get; init; }
    public bool Posted { get; init; }
    public Guid? JournalEntryId { get; init; }
    public Guid? ReversalEntryId { get; init; }
    public string Message { get; init; } = string.Empty;
}

public static class CurrencyMappers
{
    public static ExchangeRateDto ToDto(this ExchangeRate r) => new()
    {
        Id = r.Id,
        CurrencyCode = r.CurrencyCode,
        RateDate = r.RateDate,
        Rate = r.Rate,
    };
}
