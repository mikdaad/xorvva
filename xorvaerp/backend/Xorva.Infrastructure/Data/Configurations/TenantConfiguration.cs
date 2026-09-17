using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Core.Entities;

namespace Xorva.Infrastructure.Data.Configurations;

public class TenantConfiguration : IEntityTypeConfiguration<Tenant>
{
    public void Configure(EntityTypeBuilder<Tenant> builder)
    {
        builder.ToTable("Tenants");

        builder.HasKey(t => t.Id);

        builder.Property(t => t.Name)
            .IsRequired()
            .HasMaxLength(200);

        builder.Property(t => t.ContactEmail)
            .IsRequired()
            .HasMaxLength(256);

        builder.Property(t => t.IsActive)
            .IsRequired()
            .HasDefaultValue(true);

        // One-to-many: Tenant → Companies. Deleting a tenant is an offboarding
        // process, never a casual cascade — Restrict forces explicit cleanup.
        builder.HasMany(t => t.Companies)
            .WithOne(c => c.Tenant)
            .HasForeignKey(c => c.TenantId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
