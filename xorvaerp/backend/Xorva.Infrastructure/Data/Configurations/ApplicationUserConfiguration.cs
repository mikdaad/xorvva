using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Core.Entities;

namespace Xorva.Infrastructure.Data.Configurations;

public class ApplicationUserConfiguration : IEntityTypeConfiguration<ApplicationUser>
{
    public void Configure(EntityTypeBuilder<ApplicationUser> builder)
    {
        builder.ToTable("Users");

        builder.HasKey(u => u.Id);

        builder.Property(u => u.Email)
            .IsRequired()
            .HasMaxLength(256);

        builder.Property(u => u.PasswordHash)
            .IsRequired()
            .HasMaxLength(512);

        builder.Property(u => u.FirstName)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(u => u.LastName)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(u => u.Role)
            .IsRequired()
            .HasConversion<string>()   // Store enum as string for readability in DB
            .HasMaxLength(50);

        builder.Property(u => u.IsActive)
            .IsRequired()
            .HasDefaultValue(true);

        // Email is unique PLATFORM-WIDE (one email = one account), because login
        // resolves the user by email alone — pre-tenant context. Allowing the same
        // email in two tenants would make login ambiguous. Decided Day 2.
        builder.HasIndex(u => u.Email)
            .IsUnique()
            .HasDatabaseName("IX_Users_Email");

        // Performance index for tenant-scoped queries
        builder.HasIndex(u => u.TenantId)
            .HasDatabaseName("IX_Users_TenantId");

        builder.HasIndex(u => new { u.TenantId, u.CompanyId })
            .HasDatabaseName("IX_Users_TenantId_CompanyId");

        // Ignore computed property — not stored in DB
        builder.Ignore(u => u.FullName);

        // One-to-many: User → RefreshTokens
        builder.HasMany(u => u.RefreshTokens)
            .WithOne(rt => rt.User)
            .HasForeignKey(rt => rt.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
