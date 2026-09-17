using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Modules.Platform.Entities;

namespace Xorva.Infrastructure.Data.Configurations.Platform;

public class EntityDefinitionConfiguration : IEntityTypeConfiguration<EntityDefinition>
{
    public void Configure(EntityTypeBuilder<EntityDefinition> b)
    {
        b.ToTable("EntityDefinitions");
        b.HasKey(e => e.Id);
        b.Property(e => e.Key).IsRequired().HasMaxLength(80);
        b.Property(e => e.Label).IsRequired().HasMaxLength(80);
        b.Property(e => e.PluralLabel).IsRequired().HasMaxLength(80);
        b.Property(e => e.ModuleKey).IsRequired().HasMaxLength(40);
        b.Property(e => e.AttachTo).HasMaxLength(40);
        b.Property(e => e.Icon).HasMaxLength(60);
        b.Property(e => e.Description).HasMaxLength(400);
        b.HasIndex(e => new { e.TenantId, e.Key }).IsUnique()
            .HasDatabaseName("IX_EntityDefinitions_TenantId_Key");
        b.HasMany(e => e.Fields)
            .WithOne(f => f.EntityDefinition)
            .HasForeignKey(f => f.EntityDefinitionId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public class FieldDefinitionConfiguration : IEntityTypeConfiguration<FieldDefinition>
{
    public void Configure(EntityTypeBuilder<FieldDefinition> b)
    {
        b.ToTable("FieldDefinitions");
        b.HasKey(f => f.Id);
        b.Property(f => f.Key).IsRequired().HasMaxLength(80);
        b.Property(f => f.Label).IsRequired().HasMaxLength(80);
        b.Property(f => f.Type).HasConversion<string>().HasMaxLength(20);
        b.Property(f => f.Options).HasMaxLength(2000);
        b.Property(f => f.Placeholder).HasMaxLength(160);
        b.HasIndex(f => new { f.EntityDefinitionId, f.SortOrder })
            .HasDatabaseName("IX_FieldDefinitions_EntityDefinitionId_SortOrder");
    }
}

public class CustomRecordConfiguration : IEntityTypeConfiguration<CustomRecord>
{
    public void Configure(EntityTypeBuilder<CustomRecord> b)
    {
        b.ToTable("CustomRecords");
        b.HasKey(r => r.Id);
        // JSONB on PostgreSQL (indexable JSON); SQLite (tests) stores it as text via affinity.
        b.Property(r => r.Data).IsRequired().HasColumnType("jsonb");
        b.HasOne(r => r.EntityDefinition)
            .WithMany()
            .HasForeignKey(r => r.EntityDefinitionId)
            .OnDelete(DeleteBehavior.Restrict);
        b.HasIndex(r => new { r.CompanyId, r.EntityDefinitionId })
            .HasDatabaseName("IX_CustomRecords_CompanyId_EntityDefinitionId");
        b.HasIndex(r => new { r.EntityDefinitionId, r.ParentId })
            .HasDatabaseName("IX_CustomRecords_EntityDefinitionId_ParentId");
    }
}
