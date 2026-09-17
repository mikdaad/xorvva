using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Modules.Accounting.Banking.Entities;
using Xorva.Modules.Accounting.Contacts.Entities;
using Xorva.Modules.Accounting.Sales.Entities;
using Xorva.Modules.Accounting.Tax.Entities;

namespace Xorva.Infrastructure.Data.Configurations.Accounting;

public class TaxRateConfiguration : IEntityTypeConfiguration<TaxRate>
{
    public void Configure(EntityTypeBuilder<TaxRate> b)
    {
        b.ToTable("TaxRates");
        b.HasKey(t => t.Id);
        b.Property(t => t.Name).IsRequired().HasMaxLength(60);
        b.Property(t => t.Rate).HasColumnType("decimal(5,2)");
        b.Property(t => t.AppliesTo).HasConversion<string>().HasMaxLength(20);
        b.HasIndex(t => new { t.CompanyId, t.Name })
            .HasDatabaseName("IX_TaxRates_CompanyId_Name");
    }
}

public class ContactConfiguration : IEntityTypeConfiguration<Contact>
{
    public void Configure(EntityTypeBuilder<Contact> b)
    {
        b.ToTable("Contacts");
        b.HasKey(c => c.Id);
        b.Property(c => c.Code).IsRequired().HasMaxLength(20);
        b.Property(c => c.Name).IsRequired().HasMaxLength(150);
        b.Property(c => c.ContactType).HasConversion<string>().HasMaxLength(20);
        b.Property(c => c.TaxNumber).HasMaxLength(30);
        b.Property(c => c.Email).HasMaxLength(150);
        b.Property(c => c.Phone).HasMaxLength(40);
        b.Property(c => c.OutstandingBalance).HasColumnType("decimal(18,2)");
        b.HasIndex(c => new { c.CompanyId, c.Code }).IsUnique()
            .HasDatabaseName("IX_Contacts_CompanyId_Code");
    }
}

public class ProductConfiguration : IEntityTypeConfiguration<Product>
{
    public void Configure(EntityTypeBuilder<Product> b)
    {
        b.ToTable("Products");
        b.HasKey(p => p.Id);
        b.Property(p => p.Name).IsRequired().HasMaxLength(150);
        b.Property(p => p.Code).HasMaxLength(30);
        b.Property(p => p.Description).HasMaxLength(500);
        b.Property(p => p.SalesPrice).HasColumnType("decimal(18,2)");
        b.HasIndex(p => new { p.CompanyId, p.Name })
            .HasDatabaseName("IX_Products_CompanyId_Name");
    }
}

public class BankAccountConfiguration : IEntityTypeConfiguration<BankAccount>
{
    public void Configure(EntityTypeBuilder<BankAccount> b)
    {
        b.ToTable("BankAccounts");
        b.HasKey(x => x.Id);
        b.Property(x => x.Name).IsRequired().HasMaxLength(120);
        b.Property(x => x.BankName).HasMaxLength(120);
        b.Property(x => x.AccountNumber).HasMaxLength(50);
        b.Property(x => x.Iban).HasMaxLength(40);
        b.HasIndex(x => new { x.CompanyId, x.Name })
            .HasDatabaseName("IX_BankAccounts_CompanyId_Name");
    }
}
