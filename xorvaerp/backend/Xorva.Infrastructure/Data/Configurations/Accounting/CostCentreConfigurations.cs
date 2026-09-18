using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Modules.Accounting.CostCentres.Entities;

namespace Xorva.Infrastructure.Data.Configurations.Accounting;

// Read-model mappings for tables owned by Sql/Accounting/0002_cost_centres.sql
// (see the header comment in VoucherConfigurations.cs for the contract).

public class CostCentreDimensionConfiguration : IEntityTypeConfiguration<CostCentreDimension>
{
    public void Configure(EntityTypeBuilder<CostCentreDimension> b)
    {
        b.ToTable("CostCentreDimensions");
        b.HasKey(d => d.Id);
        b.Property(d => d.DimensionType).HasConversion<string>().HasMaxLength(20).IsRequired();
        b.Property(d => d.Name).HasMaxLength(150).IsRequired();
        b.Property(d => d.Code).HasMaxLength(20).IsRequired();
        b.Property(d => d.Description).HasMaxLength(500);

        b.HasIndex(d => new { d.CompanyId, d.Code }).IsUnique().HasDatabaseName("UQ_CostCentreDimensions_CompanyId_Code");
        b.HasIndex(d => d.CompanyId).HasDatabaseName("IX_CostCentreDimensions_CompanyId");
    }
}

public class CostCentreConfiguration : IEntityTypeConfiguration<CostCentre>
{
    public void Configure(EntityTypeBuilder<CostCentre> b)
    {
        b.ToTable("CostCentres");
        b.HasKey(c => c.Id);
        b.Property(c => c.Code).HasMaxLength(30).IsRequired();
        b.Property(c => c.Name).HasMaxLength(150).IsRequired();
        b.Property(c => c.Level).HasColumnType("smallint");
        b.Property(c => c.Budget).HasColumnType("numeric(18,2)");
        b.Property(c => c.StartDate).HasColumnType("date");
        b.Property(c => c.EndDate).HasColumnType("date");

        b.HasOne<CostCentreDimension>().WithMany().HasForeignKey(c => c.DimensionId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<CostCentre>().WithMany().HasForeignKey(c => c.ParentId).OnDelete(DeleteBehavior.SetNull);

        b.HasIndex(c => new { c.CompanyId, c.DimensionId, c.Code }).IsUnique().HasDatabaseName("UQ_CostCentres_CompanyId_DimensionId_Code");
        b.HasIndex(c => c.CompanyId).HasDatabaseName("IX_CostCentres_CompanyId");
        b.HasIndex(c => c.DimensionId).HasDatabaseName("IX_CostCentres_DimensionId");
    }
}
