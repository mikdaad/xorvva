using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Infrastructure.Data.Configurations.Accounting;

public class AccountingSettingsConfiguration : IEntityTypeConfiguration<AccountingSettings>
{
    public void Configure(EntityTypeBuilder<AccountingSettings> builder)
    {
        builder.ToTable("AccountingSettings");
        builder.HasKey(s => s.Id);

        builder.Property(s => s.BaseCurrency).IsRequired().HasMaxLength(3);

        // Seller e-invoicing identity.
        builder.Property(s => s.LegalName).HasMaxLength(200);
        builder.Property(s => s.TaxRegistrationNumber).HasMaxLength(30);
        builder.Property(s => s.AddressLine).HasMaxLength(200);
        builder.Property(s => s.City).HasMaxLength(100);
        builder.Property(s => s.CountryCode).IsRequired().HasMaxLength(2).HasDefaultValue("AE");

        builder.Property(s => s.InvoicePrefix).IsRequired().HasMaxLength(10);
        builder.Property(s => s.BillPrefix).IsRequired().HasMaxLength(10);
        builder.Property(s => s.JournalPrefix).IsRequired().HasMaxLength(10);
        builder.Property(s => s.PaymentPrefix).IsRequired().HasMaxLength(10);

        // Exactly one settings row per company.
        builder.HasIndex(s => s.CompanyId).IsUnique()
            .HasDatabaseName("IX_AccountingSettings_CompanyId");
    }
}
