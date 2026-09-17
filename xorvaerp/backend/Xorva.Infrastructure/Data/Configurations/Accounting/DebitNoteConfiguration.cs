using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Modules.Accounting.Purchases.Entities;

namespace Xorva.Infrastructure.Data.Configurations.Accounting;

public class DebitNoteConfiguration : IEntityTypeConfiguration<DebitNote>
{
    public void Configure(EntityTypeBuilder<DebitNote> b)
    {
        b.ToTable("DebitNotes");
        b.HasKey(d => d.Id);
        b.Property(d => d.Number).IsRequired().HasMaxLength(30);
        b.Property(d => d.Status).HasConversion<string>().HasMaxLength(20);
        b.Property(d => d.Currency).IsRequired().HasMaxLength(3);
        b.Property(d => d.Reason).HasMaxLength(500);
        foreach (var col in new[] { nameof(DebitNote.SubTotal), nameof(DebitNote.TaxTotal), nameof(DebitNote.Total) })
            b.Property(col).HasColumnType("decimal(18,2)");
        b.HasMany(d => d.Lines).WithOne().HasForeignKey(l => l.DebitNoteId).OnDelete(DeleteBehavior.Cascade);
        b.HasIndex(d => new { d.CompanyId, d.Number }).IsUnique().HasDatabaseName("IX_DebitNotes_CompanyId_Number");
    }
}

public class DebitNoteLineConfiguration : IEntityTypeConfiguration<DebitNoteLine>
{
    public void Configure(EntityTypeBuilder<DebitNoteLine> b)
    {
        b.ToTable("DebitNoteLines");
        b.HasKey(l => l.Id);
        b.Property(l => l.Description).IsRequired().HasMaxLength(300);
        b.Property(l => l.Quantity).HasColumnType("decimal(18,2)");
        b.Property(l => l.UnitPrice).HasColumnType("decimal(18,2)");
        b.Property(l => l.TaxRatePercent).HasColumnType("decimal(5,2)");
        b.Property(l => l.LineAmount).HasColumnType("decimal(18,2)");
        b.Property(l => l.LineTax).HasColumnType("decimal(18,2)");
        b.HasIndex(l => l.DebitNoteId).HasDatabaseName("IX_DebitNoteLines_DebitNoteId");
    }
}
