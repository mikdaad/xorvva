using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Infrastructure.Data.Configurations.Accounting;

public class AccountConfiguration : IEntityTypeConfiguration<Account>
{
    public void Configure(EntityTypeBuilder<Account> builder)
    {
        builder.ToTable("Accounts");
        builder.HasKey(a => a.Id);

        builder.Property(a => a.Code).IsRequired().HasMaxLength(20);
        builder.Property(a => a.Name).IsRequired().HasMaxLength(150);
        builder.Property(a => a.Description).HasMaxLength(500);

        builder.Property(a => a.AccountType).HasConversion<string>().HasMaxLength(20);
        builder.Property(a => a.AccountSubType).HasConversion<string>().HasMaxLength(30);
        builder.Property(a => a.NormalBalance).HasConversion<string>().HasMaxLength(10);

        // Money — decimal, never float.
        builder.Property(a => a.CurrentBalance).HasColumnType("decimal(18,2)");

        // Tally ledger attributes (Sql/Accounting/0005 — columns already exist when EF learns about them).
        builder.Property(a => a.NameAr).HasMaxLength(150);
        builder.Property(a => a.PartyTrn).HasMaxLength(15);
        builder.Property(a => a.PlaceOfSupply).HasMaxLength(50);

        // Ledger code is unique within a company.
        builder.HasIndex(a => new { a.CompanyId, a.Code }).IsUnique()
            .HasDatabaseName("IX_Accounts_CompanyId_Code");
    }
}
