using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Modules.Accounting.Sales.Entities;

namespace Xorva.Infrastructure.Data.Configurations.Accounting;

public class CustomerPaymentConfiguration : IEntityTypeConfiguration<CustomerPayment>
{
    public void Configure(EntityTypeBuilder<CustomerPayment> b)
    {
        b.ToTable("CustomerPayments");
        b.HasKey(p => p.Id);
        b.Property(p => p.Number).IsRequired().HasMaxLength(30);
        b.Property(p => p.Amount).HasColumnType("decimal(18,2)");
        b.Property(p => p.Currency).IsRequired().HasMaxLength(3);
        b.Property(p => p.ExchangeRate).HasColumnType("decimal(18,6)");
        b.Property(p => p.Method).HasConversion<string>().HasMaxLength(20);
        b.Property(p => p.Reference).HasMaxLength(200);

        b.HasMany(p => p.Allocations).WithOne().HasForeignKey(a => a.CustomerPaymentId).OnDelete(DeleteBehavior.Cascade);
        b.HasIndex(p => new { p.CompanyId, p.Number }).IsUnique().HasDatabaseName("IX_CustomerPayments_CompanyId_Number");
        b.HasIndex(p => new { p.CompanyId, p.ContactId }).HasDatabaseName("IX_CustomerPayments_CompanyId_ContactId");
    }
}

public class PaymentAllocationConfiguration : IEntityTypeConfiguration<PaymentAllocation>
{
    public void Configure(EntityTypeBuilder<PaymentAllocation> b)
    {
        b.ToTable("PaymentAllocations");
        b.HasKey(a => a.Id);
        b.Property(a => a.Amount).HasColumnType("decimal(18,2)");
        b.HasIndex(a => a.InvoiceId).HasDatabaseName("IX_PaymentAllocations_InvoiceId");
    }
}
