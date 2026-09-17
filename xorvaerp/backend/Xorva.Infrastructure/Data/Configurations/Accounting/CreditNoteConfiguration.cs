using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Modules.Accounting.Sales.Entities;

namespace Xorva.Infrastructure.Data.Configurations.Accounting;

public class CreditNoteConfiguration : IEntityTypeConfiguration<CreditNote>
{
    public void Configure(EntityTypeBuilder<CreditNote> b)
    {
        b.ToTable("CreditNotes");
        b.HasKey(c => c.Id);
        b.Property(c => c.Number).IsRequired().HasMaxLength(30);
        b.Property(c => c.Status).HasConversion<string>().HasMaxLength(20);
        b.Property(c => c.Currency).IsRequired().HasMaxLength(3);
        b.Property(c => c.Reason).HasMaxLength(500);
        foreach (var col in new[] { nameof(CreditNote.SubTotal), nameof(CreditNote.TaxTotal), nameof(CreditNote.Total) })
            b.Property(col).HasColumnType("decimal(18,2)");
        b.HasMany(c => c.Lines).WithOne().HasForeignKey(l => l.CreditNoteId).OnDelete(DeleteBehavior.Cascade);
        b.HasIndex(c => new { c.CompanyId, c.Number }).IsUnique().HasDatabaseName("IX_CreditNotes_CompanyId_Number");
    }
}

public class CreditNoteLineConfiguration : IEntityTypeConfiguration<CreditNoteLine>
{
    public void Configure(EntityTypeBuilder<CreditNoteLine> b)
    {
        b.ToTable("CreditNoteLines");
        b.HasKey(l => l.Id);
        b.Property(l => l.Description).IsRequired().HasMaxLength(300);
        b.Property(l => l.Quantity).HasColumnType("decimal(18,2)");
        b.Property(l => l.UnitPrice).HasColumnType("decimal(18,2)");
        b.Property(l => l.TaxRatePercent).HasColumnType("decimal(5,2)");
        b.Property(l => l.LineAmount).HasColumnType("decimal(18,2)");
        b.Property(l => l.LineTax).HasColumnType("decimal(18,2)");
        b.HasIndex(l => l.CreditNoteId).HasDatabaseName("IX_CreditNoteLines_CreditNoteId");
    }
}
