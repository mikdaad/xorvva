using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Modules.Accounting.Banking.Entities;

namespace Xorva.Infrastructure.Data.Configurations.Accounting;

// Read-model mappings for tables owned by Sql/Accounting/0004_bank_import.sql
// (see the header comment in VoucherConfigurations.cs for the contract).

public class BankStatementConfiguration : IEntityTypeConfiguration<BankStatement>
{
    public void Configure(EntityTypeBuilder<BankStatement> b)
    {
        b.ToTable("BankStatements");
        b.HasKey(s => s.Id);
        b.Property(s => s.StatementDate).HasColumnType("date");
        b.Property(s => s.PeriodFrom).HasColumnType("date");
        b.Property(s => s.PeriodTo).HasColumnType("date");
        b.Property(s => s.OpeningBalance).HasColumnType("numeric(18,2)");
        b.Property(s => s.ClosingBalance).HasColumnType("numeric(18,2)");
        b.Property(s => s.TotalDebits).HasColumnType("numeric(18,2)");
        b.Property(s => s.TotalCredits).HasColumnType("numeric(18,2)");
        b.Property(s => s.SourceFile).HasMaxLength(260);
        b.Property(s => s.SourceFormat).HasMaxLength(20);
        b.Property(s => s.ImportStatus).HasConversion<string>().HasMaxLength(20).IsRequired();
        // JSONB on PostgreSQL; SQLite (tests) stores it as text via affinity.
        b.Property(s => s.ImportErrors).HasColumnType("jsonb");

        b.HasOne<BankAccount>().WithMany().HasForeignKey(s => s.BankAccountId).OnDelete(DeleteBehavior.Restrict);
        b.HasMany(s => s.Lines).WithOne().HasForeignKey(l => l.StatementId).OnDelete(DeleteBehavior.Cascade);

        b.HasIndex(s => s.CompanyId).HasDatabaseName("IX_BankStatements_CompanyId");
        b.HasIndex(s => s.BankAccountId).HasDatabaseName("IX_BankStatements_BankAccountId");
        b.HasIndex(s => new { s.PeriodFrom, s.PeriodTo }).HasDatabaseName("IX_BankStatements_Period");
    }
}

public class BankStatementLineConfiguration : IEntityTypeConfiguration<BankStatementLine>
{
    public void Configure(EntityTypeBuilder<BankStatementLine> b)
    {
        b.ToTable("BankStatementLines");
        b.HasKey(l => l.Id);
        b.Property(l => l.LineDate).HasColumnType("date");
        b.Property(l => l.ValueDate).HasColumnType("date");
        b.Property(l => l.Description).HasMaxLength(1000).IsRequired();
        b.Property(l => l.Reference).HasMaxLength(200);
        b.Property(l => l.ChequeNumber).HasMaxLength(50);
        b.Property(l => l.Debit).HasColumnType("numeric(18,2)");
        b.Property(l => l.Credit).HasColumnType("numeric(18,2)");
        b.Property(l => l.Balance).HasColumnType("numeric(18,2)");
        b.Property(l => l.RawData).HasColumnType("jsonb");
        b.Property(l => l.MatchStatus).HasConversion<string>().HasMaxLength(20).IsRequired();

        b.HasIndex(l => l.StatementId).HasDatabaseName("IX_BankStatementLines_StatementId");
        b.HasIndex(l => l.CompanyId).HasDatabaseName("IX_BankStatementLines_CompanyId");
        b.HasIndex(l => l.BankAccountId).HasDatabaseName("IX_BankStatementLines_BankAccountId");
        b.HasIndex(l => new { l.CompanyId, l.MatchStatus }).HasDatabaseName("IX_BankStatementLines_MatchStatus");
        b.HasIndex(l => l.MatchedJournalLineId).IsUnique().HasDatabaseName("UQ_BankStatementLines_MatchedJournalLine");
    }
}

public class BankMatchRuleConfiguration : IEntityTypeConfiguration<BankMatchRule>
{
    public void Configure(EntityTypeBuilder<BankMatchRule> b)
    {
        b.ToTable("BankMatchRules");
        b.HasKey(r => r.Id);
        b.Property(r => r.RuleName).HasMaxLength(100).IsRequired();
        b.Property(r => r.Description).HasMaxLength(500);
        b.Property(r => r.Pattern).HasMaxLength(500).IsRequired();
        b.Property(r => r.PatternField).HasConversion<string>().HasMaxLength(20).IsRequired();
        b.Property(r => r.TargetVoucherType).HasConversion<string>().HasMaxLength(20);

        b.HasIndex(r => new { r.CompanyId, r.RuleName }).IsUnique().HasDatabaseName("UQ_BankMatchRules_CompanyId_RuleName");
        b.HasIndex(r => new { r.CompanyId, r.Priority }).HasDatabaseName("IX_BankMatchRules_CompanyId_Priority");
    }
}
