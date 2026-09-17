using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Modules.HR.Entities;

namespace Xorva.Infrastructure.Data.Configurations.HR;

public class EmployeeTabConfiguration : IEntityTypeConfiguration<EmployeeTab>
{
    public void Configure(EntityTypeBuilder<EmployeeTab> b)
    {
        b.ToTable("EmployeeTabs");
        b.HasKey(t => t.Id);
        b.Property(t => t.Key).IsRequired().HasMaxLength(80);
        b.Property(t => t.Label).IsRequired().HasMaxLength(80);
        b.Property(t => t.Icon).HasMaxLength(60);
        b.HasIndex(t => new { t.CompanyId, t.Key }).IsUnique()
            .HasDatabaseName("IX_EmployeeTabs_CompanyId_Key");
        b.HasMany(t => t.Fields)
            .WithOne(f => f.EmployeeTab)
            .HasForeignKey(f => f.EmployeeTabId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public class EmployeeTabFieldConfiguration : IEntityTypeConfiguration<EmployeeTabField>
{
    public void Configure(EntityTypeBuilder<EmployeeTabField> b)
    {
        b.ToTable("EmployeeTabFields");
        b.HasKey(f => f.Id);
        b.Property(f => f.Key).IsRequired().HasMaxLength(80);
        b.Property(f => f.Label).IsRequired().HasMaxLength(80);
        b.Property(f => f.Type).HasConversion<string>().HasMaxLength(20);
        b.Property(f => f.Options).HasMaxLength(2000);
        b.HasIndex(f => new { f.EmployeeTabId, f.SortOrder })
            .HasDatabaseName("IX_EmployeeTabFields_EmployeeTabId_SortOrder");
    }
}

public class EmployeeTabRecordConfiguration : IEntityTypeConfiguration<EmployeeTabRecord>
{
    public void Configure(EntityTypeBuilder<EmployeeTabRecord> b)
    {
        b.ToTable("EmployeeTabRecords");
        b.HasKey(r => r.Id);
        // JSONB on PostgreSQL; SQLite (tests) stores it as text via affinity.
        b.Property(r => r.Data).IsRequired().HasColumnType("jsonb");
        b.HasOne<EmployeeTab>()
            .WithMany()
            .HasForeignKey(r => r.EmployeeTabId)
            .OnDelete(DeleteBehavior.Restrict);
        b.HasIndex(r => new { r.EmployeeId, r.EmployeeTabId })
            .HasDatabaseName("IX_EmployeeTabRecords_EmployeeId_EmployeeTabId");
    }
}
