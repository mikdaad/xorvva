using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Modules.Accounting.Vouchers.Entities;

namespace Xorva.Infrastructure.Data.Configurations.Accounting;

// ─────────────────────────────────────────────────────────────────────────────
// READ-MODEL MAPPINGS for tables owned by Sql/Accounting/0003_vouchers_and_ledger_invariants.sql.
//
// The SQL script creates the tables (CREATE TABLE IF NOT EXISTS) — EF only needs to KNOW
// about them so LINQ, the global tenant filter, SaveChanges audit and the SQLite test
// databases (EnsureCreated) work. Column names / PostgreSQL types / index names below
// mirror the script exactly. The one EF migration that introduces these entities does not
// emit CreateTable — its Up() just runs the scripts (see Migrations/AccountingSqlPort.cs).
// Never let EF "fix" a difference here — change the SQL and re-run Sql/Tests.
// ─────────────────────────────────────────────────────────────────────────────

public class VoucherConfiguration : IEntityTypeConfiguration<Voucher>
{
    public void Configure(EntityTypeBuilder<Voucher> b)
    {
        b.ToTable("Vouchers");
        b.HasKey(v => v.Id);

        b.Property(v => v.VoucherType).HasConversion<string>().HasMaxLength(20).IsRequired();
        b.Property(v => v.VoucherNumber).HasMaxLength(30).IsRequired();
        b.Property(v => v.Status).HasConversion<string>().HasMaxLength(20).IsRequired();

        b.Property(v => v.VoucherDate).HasColumnType("date");
        b.Property(v => v.DueDate).HasColumnType("date");
        b.Property(v => v.SupplyDate).HasColumnType("date");

        b.Property(v => v.Currency).HasMaxLength(3).IsRequired();
        b.Property(v => v.ExchangeRate).HasColumnType("numeric(18,6)");

        foreach (var money in new[] {
            nameof(Voucher.SubTotal), nameof(Voucher.DiscountTotal), nameof(Voucher.TaxTotal), nameof(Voucher.TotalAmount),
            nameof(Voucher.BaseSubTotal), nameof(Voucher.BaseDiscount), nameof(Voucher.BaseTaxTotal), nameof(Voucher.BaseTotalAmount),
            nameof(Voucher.AmountPaid) })
        {
            b.Property<decimal>(money).HasColumnType("numeric(18,2)");
        }

        // GENERATED ALWAYS AS ("TotalAmount" - "AmountPaid") STORED — EF reads, never writes.
        b.Property(v => v.AmountDue).HasColumnType("numeric(18,2)")
            .HasComputedColumnSql("\"TotalAmount\" - \"AmountPaid\"", stored: true)
            .ValueGeneratedOnAddOrUpdate();

        b.Property(v => v.Reference).HasMaxLength(100);
        b.Property(v => v.Narration).HasMaxLength(500);
        b.Property(v => v.TermsAndConditions).HasColumnType("text");
        b.Property(v => v.InternalNotes).HasColumnType("text");
        b.Property(v => v.PlaceOfSupply).HasMaxLength(50);
        b.Property(v => v.BuyerTrn).HasMaxLength(30);
        b.Property(v => v.SellerTrn).HasMaxLength(30);
        b.Property(v => v.ReversalReason).HasMaxLength(500);

        b.HasMany(v => v.Lines).WithOne().HasForeignKey(l => l.VoucherId).OnDelete(DeleteBehavior.Cascade);

        b.HasIndex(v => new { v.CompanyId, v.VoucherType, v.VoucherNumber }).IsUnique()
            .HasDatabaseName("UQ_Vouchers_Company_Type_Number");
        b.HasIndex(v => v.CompanyId).HasDatabaseName("IX_Vouchers_CompanyId");
        b.HasIndex(v => new { v.CompanyId, v.VoucherType }).HasDatabaseName("IX_Vouchers_CompanyId_Type");
        b.HasIndex(v => new { v.CompanyId, v.Status }).HasDatabaseName("IX_Vouchers_CompanyId_Status");
        b.HasIndex(v => new { v.CompanyId, v.VoucherDate }).IsDescending(false, true).HasDatabaseName("IX_Vouchers_CompanyId_Date");
    }
}

public class VoucherLineConfiguration : IEntityTypeConfiguration<VoucherLine>
{
    public void Configure(EntityTypeBuilder<VoucherLine> b)
    {
        b.ToTable("VoucherLines");
        b.HasKey(l => l.Id);

        b.Property(l => l.Description).HasMaxLength(500);
        b.Property(l => l.DrCr).HasColumnType("character(2)").IsRequired();

        b.Property(l => l.Quantity).HasColumnType("numeric(18,4)");
        b.Property(l => l.UnitPrice).HasColumnType("numeric(18,4)");
        b.Property(l => l.DiscountPct).HasColumnType("numeric(5,2)");
        b.Property(l => l.TaxRatePercent).HasColumnType("numeric(5,2)");
        foreach (var money in new[] {
            nameof(VoucherLine.LineAmount), nameof(VoucherLine.TaxAmount), nameof(VoucherLine.LineTotal),
            nameof(VoucherLine.BaseLineAmount), nameof(VoucherLine.BaseTaxAmount), nameof(VoucherLine.BaseLineTotal) })
        {
            b.Property<decimal>(money).HasColumnType("numeric(18,2)");
        }

        b.HasIndex(l => new { l.VoucherId, l.LineNumber }).IsUnique().HasDatabaseName("UQ_VoucherLines_Voucher_LineNumber");
        b.HasIndex(l => l.VoucherId).HasDatabaseName("IX_VoucherLines_VoucherId");
        b.HasIndex(l => l.CompanyId).HasDatabaseName("IX_VoucherLines_CompanyId");
        b.HasIndex(l => l.AccountId).HasDatabaseName("IX_VoucherLines_AccountId");
    }
}
