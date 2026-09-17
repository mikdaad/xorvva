using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Core.Entities;

namespace Xorva.Infrastructure.Data.Configurations;

public class CompanyConfiguration : IEntityTypeConfiguration<Company>
{
    public void Configure(EntityTypeBuilder<Company> builder)
    {
        builder.ToTable("Companies");

        builder.HasKey(c => c.Id);

        builder.Property(c => c.Name)
            .IsRequired()
            .HasMaxLength(200);

        builder.Property(c => c.Currency)
            .IsRequired()
            .HasMaxLength(3); // ISO 4217

        builder.Property(c => c.Timezone)
            .IsRequired()
            .HasMaxLength(64); // IANA id

        // List<string> → PostgreSQL text[] (Npgsql primitive collection mapping)
        builder.Property(c => c.ActiveModules);

        builder.Property(c => c.IsActive)
            .IsRequired()
            .HasDefaultValue(true);

        // Company names unique within a tenant
        builder.HasIndex(c => new { c.TenantId, c.Name })
            .IsUnique()
            .HasDatabaseName("IX_Companies_TenantId_Name");

        builder.HasIndex(c => c.TenantId)
            .HasDatabaseName("IX_Companies_TenantId");
    }
}
