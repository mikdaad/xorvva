using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Modules.HR.Entities;

namespace Xorva.Infrastructure.Data.Configurations.HR;

public class EmployeeHistoryConfiguration : IEntityTypeConfiguration<EmployeeHistory>
{
    public void Configure(EntityTypeBuilder<EmployeeHistory> builder)
    {
        builder.ToTable("EmployeeHistories");
        builder.HasKey(h => h.Id);

        builder.Property(h => h.ChangeType).IsRequired().HasMaxLength(50);
        builder.Property(h => h.OldValue).HasMaxLength(500);
        builder.Property(h => h.NewValue).HasMaxLength(500);
        builder.Property(h => h.ChangedByEmail).HasMaxLength(256);
        builder.Property(h => h.Reason).HasMaxLength(1000);

        builder.HasIndex(h => new { h.CompanyId, h.EmployeeId })
            .HasDatabaseName("IX_EmployeeHistories_CompanyId_EmployeeId");
    }
}
