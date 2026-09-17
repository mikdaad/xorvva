using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Modules.HR.Entities;

namespace Xorva.Infrastructure.Data.Configurations.HR;

public class HolidayConfiguration : IEntityTypeConfiguration<Holiday>
{
    public void Configure(EntityTypeBuilder<Holiday> builder)
    {
        builder.ToTable("Holidays");
        builder.HasKey(h => h.Id);
        builder.Property(h => h.Name).IsRequired().HasMaxLength(100);
        builder.HasIndex(h => new { h.CompanyId, h.Date })
            .HasDatabaseName("IX_Holidays_CompanyId_Date");
    }
}

public class LeaveTypeConfiguration : IEntityTypeConfiguration<LeaveType>
{
    public void Configure(EntityTypeBuilder<LeaveType> builder)
    {
        builder.ToTable("LeaveTypes");
        builder.HasKey(t => t.Id);
        builder.Property(t => t.Name).IsRequired().HasMaxLength(100);
        builder.Property(t => t.Code).IsRequired().HasMaxLength(20);
        builder.Property(t => t.Description).HasMaxLength(500);
        builder.Property(t => t.DefaultDays).HasColumnType("decimal(6,2)");
        builder.Property(t => t.MaxCarryForward).HasColumnType("decimal(6,2)");
        builder.HasIndex(t => new { t.CompanyId, t.Code }).IsUnique()
            .HasDatabaseName("IX_LeaveTypes_CompanyId_Code");
    }
}

public class LeaveAllocationConfiguration : IEntityTypeConfiguration<LeaveAllocation>
{
    public void Configure(EntityTypeBuilder<LeaveAllocation> builder)
    {
        builder.ToTable("LeaveAllocations");
        builder.HasKey(a => a.Id);
        builder.Property(a => a.TotalDays).HasColumnType("decimal(6,2)");
        builder.Property(a => a.UsedDays).HasColumnType("decimal(6,2)");
        builder.Ignore(a => a.RemainingDays);
        builder.Property(a => a.Version).IsConcurrencyToken();

        // One allocation per employee/type/year.
        builder.HasIndex(a => new { a.EmployeeId, a.LeaveTypeId, a.Year }).IsUnique()
            .HasDatabaseName("IX_LeaveAllocations_Employee_Type_Year");
    }
}

public class LeaveRequestConfiguration : IEntityTypeConfiguration<LeaveRequest>
{
    public void Configure(EntityTypeBuilder<LeaveRequest> builder)
    {
        builder.ToTable("LeaveRequests");
        builder.HasKey(r => r.Id);
        builder.Property(r => r.Reason).IsRequired().HasMaxLength(1000);
        builder.Property(r => r.RejectionReason).HasMaxLength(500);
        builder.Property(r => r.AttachmentUrl).HasMaxLength(500);
        builder.Property(r => r.TotalDays).HasColumnType("decimal(6,2)");
        builder.Property(r => r.Status).HasConversion<string>().HasMaxLength(20);

        builder.HasIndex(r => new { r.EmployeeId, r.Status })
            .HasDatabaseName("IX_LeaveRequests_EmployeeId_Status");
        builder.HasIndex(r => new { r.CompanyId, r.FromDate, r.ToDate })
            .HasDatabaseName("IX_LeaveRequests_CompanyId_Dates");
    }
}
