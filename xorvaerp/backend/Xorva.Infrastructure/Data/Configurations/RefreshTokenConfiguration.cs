using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Core.Entities;

namespace Xorva.Infrastructure.Data.Configurations;

public class RefreshTokenConfiguration : IEntityTypeConfiguration<RefreshToken>
{
    public void Configure(EntityTypeBuilder<RefreshToken> builder)
    {
        builder.ToTable("RefreshTokens");

        builder.HasKey(rt => rt.Id);

        builder.Property(rt => rt.Token)
            .IsRequired()
            .HasMaxLength(512);

        builder.Property(rt => rt.ReplacedByToken)
            .HasMaxLength(512);

        // Index for fast token lookup during refresh
        builder.HasIndex(rt => rt.Token)
            .IsUnique()
            .HasDatabaseName("IX_RefreshTokens_Token");

        // Index for finding user's active tokens
        builder.HasIndex(rt => new { rt.UserId, rt.IsRevoked })
            .HasDatabaseName("IX_RefreshTokens_UserId_IsRevoked");

        // Ignore computed property
        builder.Ignore(rt => rt.IsActive);
    }
}
