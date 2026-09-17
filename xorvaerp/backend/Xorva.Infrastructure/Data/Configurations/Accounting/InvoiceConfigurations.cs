using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Modules.Accounting.Sales.Entities;

namespace Xorva.Infrastructure.Data.Configurations.Accounting;

public class InvoiceConfiguration : IEntityTypeConfiguration<Invoice>
{
    public void Configure(EntityTypeBuilder<Invoice> b)
    {
        b.ToTable("Invoices");
        b.HasKey(i => i.Id);
        b.Property(i => i.Number).IsRequired().HasMaxLength(30);
        b.Property(i => i.Status).HasConversion<string>().HasMaxLength(20);
        b.Property(i => i.Currency).IsRequired().HasMaxLength(3);
        b.Property(i => i.ExchangeRate).HasColumnType("decimal(18,6)");
        b.Property(i => i.Notes).HasMaxLength(1000);
        foreach (var p in new[] { nameof(Invoice.SubTotal), nameof(Invoice.TaxTotal), nameof(Invoice.Total), nameof(Invoice.AmountPaid), nameof(Invoice.BalanceDue), nameof(Invoice.BaseTotal) })
            b.Property(p).HasColumnType("decimal(18,2)");

        b.HasMany(i => i.Lines).WithOne().HasForeignKey(l => l.InvoiceId).OnDelete(DeleteBehavior.Cascade);
        b.HasIndex(i => new { i.CompanyId, i.Number }).IsUnique().HasDatabaseName("IX_Invoices_CompanyId_Number");
        b.HasIndex(i => new { i.CompanyId, i.ContactId }).HasDatabaseName("IX_Invoices_CompanyId_ContactId");
    }
}

public class InvoiceLineConfiguration : IEntityTypeConfiguration<InvoiceLine>
{
    public void Configure(EntityTypeBuilder<InvoiceLine> b)
    {
        b.ToTable("InvoiceLines");
        b.HasKey(l => l.Id);
        b.Property(l => l.Description).IsRequired().HasMaxLength(300);
        b.Property(l => l.Quantity).HasColumnType("decimal(18,2)");
        b.Property(l => l.UnitPrice).HasColumnType("decimal(18,2)");
        b.Property(l => l.TaxRatePercent).HasColumnType("decimal(5,2)");
        b.Property(l => l.LineAmount).HasColumnType("decimal(18,2)");
        b.Property(l => l.LineTax).HasColumnType("decimal(18,2)");
        b.HasIndex(l => l.InvoiceId).HasDatabaseName("IX_InvoiceLines_InvoiceId");
    }
}
