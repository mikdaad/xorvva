using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.CostCentres.Entities;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.DTOs;

public record CostCentreDimensionDto
{
    public Guid Id { get; init; }
    public CostCentreDimensionType DimensionType { get; init; }
    public string Name { get; init; } = string.Empty;
    public string Code { get; init; } = string.Empty;
    public string? Description { get; init; }
    public bool IsMandatory { get; init; }
    public bool IsActive { get; init; }
    public int SortOrder { get; init; }
    public int CostCentreCount { get; init; }
}

public record CostCentreDto
{
    public Guid Id { get; init; }
    public Guid DimensionId { get; init; }
    public string? DimensionName { get; init; }
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public Guid? ParentId { get; init; }
    public int Level { get; init; }
    public bool IsGroup { get; init; }
    public bool IsActive { get; init; }
    public decimal? Budget { get; init; }
    public DateOnly? StartDate { get; init; }
    public DateOnly? EndDate { get; init; }
}

/// <summary>Row of accounting.get_cost_centre_report — debit/credit/net per cost centre in the window, with budget variance.</summary>
public record CostCentreReportRowDto
{
    public Guid CostCentreId { get; init; }
    public Guid DimensionId { get; init; }
    public string DimensionName { get; init; } = string.Empty;
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public Guid? ParentId { get; init; }
    public int Level { get; init; }
    public bool IsGroup { get; init; }
    public decimal Debit { get; init; }
    public decimal Credit { get; init; }
    /// <summary>Debit − Credit (positive = net cost).</summary>
    public decimal Net { get; init; }
    public long LineCount { get; init; }
    public decimal? Budget { get; init; }
    public decimal? Variance { get; init; }
}

public record CostCentreReportDto
{
    public DateOnly? From { get; init; }
    public DateOnly? To { get; init; }
    public Guid? DimensionId { get; init; }
    public List<CostCentreReportRowDto> Rows { get; init; } = [];
    public decimal TotalDebit { get; init; }
    public decimal TotalCredit { get; init; }
    public decimal TotalNet { get; init; }
}

public static class CostCentreMappers
{
    public static CostCentreDimensionDto ToDto(this CostCentreDimension d, int count = 0) => new()
    {
        Id = d.Id, DimensionType = d.DimensionType, Name = d.Name, Code = d.Code, Description = d.Description,
        IsMandatory = d.IsMandatory, IsActive = d.IsActive, SortOrder = d.SortOrder, CostCentreCount = count,
    };

    public static CostCentreDto ToDto(this CostCentre c, string? dimensionName = null) => new()
    {
        Id = c.Id, DimensionId = c.DimensionId, DimensionName = dimensionName, Code = c.Code, Name = c.Name, ParentId = c.ParentId,
        Level = c.Level, IsGroup = c.IsGroup, IsActive = c.IsActive, Budget = c.Budget, StartDate = c.StartDate, EndDate = c.EndDate,
    };

    public static CostCentreReportRowDto ToDto(this RpcCostCentreReportRow r, decimal? budget) => new()
    {
        CostCentreId = r.CostCentreId, DimensionId = r.DimensionId, DimensionName = r.DimensionName, Code = r.Code, Name = r.Name,
        ParentId = r.ParentId, Level = r.Level, IsGroup = r.IsGroup, Debit = r.Debit, Credit = r.Credit, Net = r.Net, LineCount = r.LineCount,
        Budget = budget, Variance = budget.HasValue ? budget.Value - r.Net : null,
    };
}
