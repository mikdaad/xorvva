using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.DTOs;

public record FiscalPeriodDto
{
    public Guid Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public DateTime StartDate { get; init; }
    public DateTime EndDate { get; init; }
    public bool IsClosed { get; init; }
    /// <summary>Open → SoftClosed (admins may still post) → HardClosed (nobody posts). Ported from TrueLedge.</summary>
    public PeriodCloseStatus CloseStatus { get; init; }
    public DateTime? ClosedAt { get; init; }
    public Guid? ClosedBy { get; init; }
}

public record FiscalYearDto
{
    public Guid Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public DateTime StartDate { get; init; }
    public DateTime EndDate { get; init; }
    public bool IsClosed { get; init; }
    public List<FiscalPeriodDto> Periods { get; init; } = [];
}

public static class FiscalMappers
{
    public static FiscalPeriodDto ToDto(this FiscalPeriod p) => new()
    {
        Id = p.Id, Name = p.Name, StartDate = p.StartDate, EndDate = p.EndDate, IsClosed = p.IsClosed,
        CloseStatus = p.CloseStatus, ClosedAt = p.ClosedAt, ClosedBy = p.ClosedBy,
    };

    public static FiscalYearDto ToDto(this FiscalYear y, IEnumerable<FiscalPeriod> periods) => new()
    {
        Id = y.Id, Name = y.Name, StartDate = y.StartDate, EndDate = y.EndDate, IsClosed = y.IsClosed,
        Periods = [.. periods.OrderBy(p => p.StartDate).Select(p => p.ToDto())],
    };
}
