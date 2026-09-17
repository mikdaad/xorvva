using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Modules.Accounting.Assets.Entities;

namespace Xorva.Infrastructure.Data.Configurations.Accounting;

public class FixedAssetConfiguration : IEntityTypeConfiguration<FixedAsset>
{
    public void Configure(EntityTypeBuilder<FixedAsset> b)
    {
        b.ToTable("FixedAssets");
        b.HasKey(a => a.Id);
        b.Property(a => a.Name).IsRequired().HasMaxLength(150);
        b.Property(a => a.Code).HasMaxLength(30);
        b.Property(a => a.Category).HasMaxLength(60);
        foreach (var col in new[] { nameof(FixedAsset.Cost), nameof(FixedAsset.SalvageValue), nameof(FixedAsset.AccumulatedDepreciation) })
            b.Property(col).HasColumnType("decimal(18,2)");
        b.HasIndex(a => new { a.CompanyId, a.Name }).HasDatabaseName("IX_FixedAssets_CompanyId_Name");
    }
}
