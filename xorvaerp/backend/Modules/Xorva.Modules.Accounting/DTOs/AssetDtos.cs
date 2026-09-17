using Xorva.Modules.Accounting.Assets.Entities;

namespace Xorva.Modules.Accounting.DTOs;

public record FixedAssetDto
{
    public Guid Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Code { get; init; }
    public string? Category { get; init; }
    public DateTime AcquisitionDate { get; init; }
    public decimal Cost { get; init; }
    public decimal SalvageValue { get; init; }
    public int UsefulLifeMonths { get; init; }
    public decimal AccumulatedDepreciation { get; init; }
    public decimal BookValue { get; init; }
    public bool IsDisposed { get; init; }
    public Guid AssetAccountId { get; init; }
    public Guid AccumulatedDepreciationAccountId { get; init; }
    public Guid DepreciationExpenseAccountId { get; init; }
}

public record DepreciationResultDto
{
    public int AssetsDepreciated { get; init; }
    public decimal TotalDepreciation { get; init; }
    public Guid? JournalEntryId { get; init; }
}

public static class AssetMappers
{
    public static FixedAssetDto ToDto(this FixedAsset a) => new()
    {
        Id = a.Id,
        Name = a.Name,
        Code = a.Code,
        Category = a.Category,
        AcquisitionDate = a.AcquisitionDate,
        Cost = a.Cost,
        SalvageValue = a.SalvageValue,
        UsefulLifeMonths = a.UsefulLifeMonths,
        AccumulatedDepreciation = a.AccumulatedDepreciation,
        BookValue = Math.Round(a.Cost - a.AccumulatedDepreciation, 2),
        IsDisposed = a.IsDisposed,
        AssetAccountId = a.AssetAccountId,
        AccumulatedDepreciationAccountId = a.AccumulatedDepreciationAccountId,
        DepreciationExpenseAccountId = a.DepreciationExpenseAccountId,
    };
}
