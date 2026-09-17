using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Infrastructure.Data.Configurations.Accounting;

public class JournalEntryConfiguration : IEntityTypeConfiguration<JournalEntry>
{
    public void Configure(EntityTypeBuilder<JournalEntry> b)
    {
        b.ToTable("JournalEntries", t =>
            // Header-level balance guard (the poster enforces Σdebit==Σcredit across lines).
            t.HasCheckConstraint("CK_JournalEntries_Balanced", "\"TotalDebit\" = \"TotalCredit\""));

        b.HasKey(e => e.Id);
        b.Property(e => e.EntryNumber).IsRequired().HasMaxLength(30);
        b.Property(e => e.Description).HasMaxLength(500);
        b.Property(e => e.SourceType).HasConversion<string>().HasMaxLength(20);
        b.Property(e => e.Status).HasConversion<string>().HasMaxLength(20);
        b.Property(e => e.TotalDebit).HasColumnType("decimal(18,2)");
        b.Property(e => e.TotalCredit).HasColumnType("decimal(18,2)");

        b.HasMany(e => e.Lines)
            .WithOne()
            .HasForeignKey(l => l.JournalEntryId)
            .OnDelete(DeleteBehavior.Cascade);

        b.HasIndex(e => new { e.CompanyId, e.EntryNumber }).IsUnique()
            .HasDatabaseName("IX_JournalEntries_CompanyId_EntryNumber");
        b.HasIndex(e => new { e.CompanyId, e.Date })
            .HasDatabaseName("IX_JournalEntries_CompanyId_Date");
    }
}

public class JournalLineConfiguration : IEntityTypeConfiguration<JournalLine>
{
    public void Configure(EntityTypeBuilder<JournalLine> b)
    {
        b.ToTable("JournalLines", t =>
            // Per-line rule: exactly one side, non-negative.
            t.HasCheckConstraint("CK_JournalLines_DebitXorCredit",
                "\"Debit\" >= 0 AND \"Credit\" >= 0 AND NOT (\"Debit\" > 0 AND \"Credit\" > 0)"));

        b.HasKey(l => l.Id);
        b.Property(l => l.Debit).HasColumnType("decimal(18,2)");
        b.Property(l => l.Credit).HasColumnType("decimal(18,2)");
        b.Property(l => l.Description).HasMaxLength(500);

        b.HasIndex(l => new { l.CompanyId, l.AccountId })
            .HasDatabaseName("IX_JournalLines_CompanyId_AccountId");
        b.HasIndex(l => l.JournalEntryId)
            .HasDatabaseName("IX_JournalLines_JournalEntryId");
    }
}
