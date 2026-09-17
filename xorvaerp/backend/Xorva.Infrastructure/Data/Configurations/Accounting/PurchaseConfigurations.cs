using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Modules.Accounting.Purchases.Entities;

namespace Xorva.Infrastructure.Data.Configurations.Accounting;

public class BillConfiguration : IEntityTypeConfiguration<Bill>
{
    public void Configure(EntityTypeBuilder<Bill> b)
    {
        b.ToTable("Bills");
        b.HasKey(x => x.Id);
        b.Property(x => x.Number).IsRequired().HasMaxLength(30);
        b.Property(x => x.SupplierReference).HasMaxLength(60);
        b.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        b.Property(x => x.Currency).IsRequired().HasMaxLength(3);
        b.Property(x => x.ExchangeRate).HasColumnType("decimal(18,6)");
        b.Property(x => x.Notes).HasMaxLength(1000);
        foreach (var p in new[] { nameof(Bill.SubTotal), nameof(Bill.TaxTotal), nameof(Bill.Total), nameof(Bill.AmountPaid), nameof(Bill.BalanceDue), nameof(Bill.BaseTotal) })
            b.Property(p).HasColumnType("decimal(18,2)");
        b.HasMany(x => x.Lines).WithOne().HasForeignKey(l => l.BillId).OnDelete(DeleteBehavior.Cascade);
        b.HasIndex(x => new { x.CompanyId, x.Number }).IsUnique().HasDatabaseName("IX_Bills_CompanyId_Number");
        b.HasIndex(x => new { x.CompanyId, x.ContactId }).HasDatabaseName("IX_Bills_CompanyId_ContactId");
    }
}

public class BillLineConfiguration : IEntityTypeConfiguration<BillLine>
{
    public void Configure(EntityTypeBuilder<BillLine> b)
    {
        b.ToTable("BillLines");
        b.HasKey(l => l.Id);
        b.Property(l => l.Description).IsRequired().HasMaxLength(300);
        b.Property(l => l.Quantity).HasColumnType("decimal(18,2)");
        b.Property(l => l.UnitPrice).HasColumnType("decimal(18,2)");
        b.Property(l => l.TaxRatePercent).HasColumnType("decimal(5,2)");
        b.Property(l => l.LineAmount).HasColumnType("decimal(18,2)");
        b.Property(l => l.LineTax).HasColumnType("decimal(18,2)");
        b.HasIndex(l => l.BillId).HasDatabaseName("IX_BillLines_BillId");
    }
}

public class SupplierPaymentConfiguration : IEntityTypeConfiguration<SupplierPayment>
{
    public void Configure(EntityTypeBuilder<SupplierPayment> b)
    {
        b.ToTable("SupplierPayments");
        b.HasKey(p => p.Id);
        b.Property(p => p.Number).IsRequired().HasMaxLength(30);
        b.Property(p => p.Amount).HasColumnType("decimal(18,2)");
        b.Property(p => p.Currency).IsRequired().HasMaxLength(3);
        b.Property(p => p.ExchangeRate).HasColumnType("decimal(18,6)");
        b.Property(p => p.Method).HasConversion<string>().HasMaxLength(20);
        b.Property(p => p.Reference).HasMaxLength(200);
        b.HasMany(p => p.Allocations).WithOne().HasForeignKey(a => a.SupplierPaymentId).OnDelete(DeleteBehavior.Cascade);
        b.HasIndex(p => new { p.CompanyId, p.Number }).IsUnique().HasDatabaseName("IX_SupplierPayments_CompanyId_Number");
    }
}

public class BillPaymentAllocationConfiguration : IEntityTypeConfiguration<BillPaymentAllocation>
{
    public void Configure(EntityTypeBuilder<BillPaymentAllocation> b)
    {
        b.ToTable("BillPaymentAllocations");
        b.HasKey(a => a.Id);
        b.Property(a => a.Amount).HasColumnType("decimal(18,2)");
        b.HasIndex(a => a.BillId).HasDatabaseName("IX_BillPaymentAllocations_BillId");
    }
}
