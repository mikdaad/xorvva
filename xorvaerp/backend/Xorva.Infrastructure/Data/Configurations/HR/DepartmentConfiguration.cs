using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Modules.HR.Entities;

namespace Xorva.Infrastructure.Data.Configurations.HR;

public class DepartmentConfiguration : IEntityTypeConfiguration<Department>
{
    public void Configure(EntityTypeBuilder<Department> builder)
    {
        builder.ToTable("Departments");
        builder.HasKey(d => d.Id);

        builder.Property(d => d.Name).IsRequired().HasMaxLength(100);
        builder.Property(d => d.Code).IsRequired().HasMaxLength(20);
        builder.Property(d => d.Description).HasMaxLength(500);
        builder.Property(d => d.Function).HasConversion<string>().HasMaxLength(20);
        builder.Property(d => d.Rules).HasColumnType("jsonb");

        builder.HasIndex(d => new { d.CompanyId, d.Name }).IsUnique()
            .HasDatabaseName("IX_Departments_CompanyId_Name");
        builder.HasIndex(d => new { d.CompanyId, d.Code }).IsUnique()
            .HasDatabaseName("IX_Departments_CompanyId_Code");
    }
}
