using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Infrastructure.Data.Configurations.Accounting;

public class FiscalYearConfiguration : IEntityTypeConfiguration<FiscalYear>
{
    public void Configure(EntityTypeBuilder<FiscalYear> b)
    {
        b.ToTable("FiscalYears");
        b.HasKey(y => y.Id);
        b.Property(y => y.Name).IsRequired().HasMaxLength(50);
        b.HasIndex(y => new { y.CompanyId, y.Name }).IsUnique()
            .HasDatabaseName("IX_FiscalYears_CompanyId_Name");
    }
}

public class FiscalPeriodConfiguration : IEntityTypeConfiguration<FiscalPeriod>
{
    public void Configure(EntityTypeBuilder<FiscalPeriod> b)
    {
        b.ToTable("FiscalPeriods");
        b.HasKey(p => p.Id);
        b.Property(p => p.Name).IsRequired().HasMaxLength(50);
        b.HasIndex(p => new { p.CompanyId, p.FiscalYearId })
            .HasDatabaseName("IX_FiscalPeriods_CompanyId_FiscalYearId");
    }
}
