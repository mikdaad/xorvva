using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Modules.HR.Entities;

namespace Xorva.Infrastructure.Data.Configurations.HR;

public class EmployeeConfiguration : IEntityTypeConfiguration<Employee>
{
    public void Configure(EntityTypeBuilder<Employee> builder)
    {
        builder.ToTable("Employees");
        builder.HasKey(e => e.Id);

        builder.Property(e => e.EmployeeCode).IsRequired().HasMaxLength(20);
        builder.Property(e => e.FirstName).IsRequired().HasMaxLength(100);
        builder.Property(e => e.LastName).IsRequired().HasMaxLength(100);
        builder.Property(e => e.Email).HasMaxLength(256);
        builder.Property(e => e.Phone).HasMaxLength(20);
        builder.Property(e => e.Nationality).HasMaxLength(100);
        builder.Property(e => e.NationalId).HasMaxLength(50);
        builder.Property(e => e.EmergencyContactName).HasMaxLength(100);
        builder.Property(e => e.EmergencyContactPhone).HasMaxLength(20);
        builder.Property(e => e.EmergencyContactRelation).HasMaxLength(50);
        builder.Property(e => e.Currency).IsRequired().HasMaxLength(3);
        builder.Property(e => e.BankName).HasMaxLength(100);
        builder.Property(e => e.AccountNumber).HasMaxLength(50);
        builder.Property(e => e.Iban).HasMaxLength(34);
        builder.Property(e => e.Notes).HasMaxLength(2000);
        builder.Property(e => e.ProfilePhotoUrl).HasMaxLength(500);

        // Money — decimal, never float.
        builder.Property(e => e.BasicSalary).HasColumnType("decimal(18,2)");

        // Enums stored as strings for DB readability.
        builder.Property(e => e.Gender).HasConversion<string>().HasMaxLength(20);
        builder.Property(e => e.MaritalStatus).HasConversion<string>().HasMaxLength(20);
        builder.Property(e => e.EmploymentType).HasConversion<string>().HasMaxLength(20);
        builder.Property(e => e.EmploymentStatus).HasConversion<string>().HasMaxLength(20);

        builder.Ignore(e => e.FullName);

        builder.HasIndex(e => new { e.CompanyId, e.EmployeeCode }).IsUnique()
            .HasDatabaseName("IX_Employees_CompanyId_EmployeeCode");
        builder.HasIndex(e => new { e.CompanyId, e.DepartmentId })
            .HasDatabaseName("IX_Employees_CompanyId_DepartmentId");
        builder.HasIndex(e => new { e.CompanyId, e.EmploymentStatus })
            .HasDatabaseName("IX_Employees_CompanyId_EmploymentStatus");
    }
}
