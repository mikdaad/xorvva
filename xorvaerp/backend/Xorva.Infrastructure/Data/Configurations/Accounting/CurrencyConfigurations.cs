using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Modules.Accounting.Currency.Entities;

namespace Xorva.Infrastructure.Data.Configurations.Accounting;

public class ExchangeRateConfiguration : IEntityTypeConfiguration<ExchangeRate>
{
    public void Configure(EntityTypeBuilder<ExchangeRate> b)
    {
        b.ToTable("ExchangeRates");
        b.HasKey(r => r.Id);
        b.Property(r => r.CurrencyCode).IsRequired().HasMaxLength(3);
        b.Property(r => r.Rate).HasColumnType("decimal(18,6)");

        // One rate per currency+effective-date within a company.
        b.HasIndex(r => new { r.CompanyId, r.CurrencyCode, r.RateDate }).IsUnique()
            .HasDatabaseName("IX_ExchangeRates_CompanyId_Currency_Date");
    }
}
