using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Core.Entities;

namespace Xorva.Infrastructure.Data.Configurations;

public class BranchConfiguration : IEntityTypeConfiguration<Branch>
{
    public void Configure(EntityTypeBuilder<Branch> builder)
    {
        builder.ToTable("Branches");

        builder.HasKey(b => b.Id);

        builder.Property(b => b.Name)
            .IsRequired()
            .HasMaxLength(200);

        builder.Property(b => b.Address).HasMaxLength(500);
        builder.Property(b => b.City).HasMaxLength(100);
        builder.Property(b => b.Country).HasMaxLength(100);

        builder.Property(b => b.IsActive)
            .IsRequired()
            .HasDefaultValue(true);

        // Branch belongs to a Company; deleting a company with branches must be explicit
        builder.HasOne(b => b.Company)
            .WithMany(c => c.Branches)
            .HasForeignKey(b => b.CompanyId)
            .OnDelete(DeleteBehavior.Restrict);

        // Branch names unique within a company
        builder.HasIndex(b => new { b.CompanyId, b.Name })
            .IsUnique()
            .HasDatabaseName("IX_Branches_CompanyId_Name");

        // The isolation filter's access path: every query hits (TenantId, CompanyId)
        builder.HasIndex(b => new { b.TenantId, b.CompanyId })
            .HasDatabaseName("IX_Branches_TenantId_CompanyId");
    }
}
