using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Modules.HR.Entities;

namespace Xorva.Infrastructure.Data.Configurations.HR;

public class DesignationConfiguration : IEntityTypeConfiguration<Designation>
{
    public void Configure(EntityTypeBuilder<Designation> builder)
    {
        builder.ToTable("Designations");
        builder.HasKey(d => d.Id);

        builder.Property(d => d.Title).IsRequired().HasMaxLength(100);
        builder.Property(d => d.Code).HasMaxLength(20);
        builder.Property(d => d.Category).HasMaxLength(60);
        builder.Property(d => d.Description).HasMaxLength(500);

        builder.HasIndex(d => new { d.CompanyId, d.Title }).IsUnique()
            .HasDatabaseName("IX_Designations_CompanyId_Title");
    }
}
