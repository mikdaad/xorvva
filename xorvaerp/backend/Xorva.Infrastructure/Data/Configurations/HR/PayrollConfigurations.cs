using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Xorva.Modules.HR.Entities;

namespace Xorva.Infrastructure.Data.Configurations.HR;

public class PayRunConfiguration : IEntityTypeConfiguration<PayRun>
{
    public void Configure(EntityTypeBuilder<PayRun> b)
    {
        b.ToTable("PayRuns");
        b.HasKey(p => p.Id);
        b.Property(p => p.Number).IsRequired().HasMaxLength(30);
        b.Property(p => p.Status).HasConversion<string>().HasMaxLength(20);
        foreach (var col in new[] { nameof(PayRun.TotalGross), nameof(PayRun.TotalDeductions), nameof(PayRun.TotalNet) })
            b.Property(col).HasColumnType("decimal(18,2)");
        b.HasMany(p => p.Payslips).WithOne().HasForeignKey(s => s.PayRunId).OnDelete(DeleteBehavior.Cascade);
        b.HasIndex(p => new { p.CompanyId, p.Year, p.Month }).IsUnique()
            .HasDatabaseName("IX_PayRuns_CompanyId_Year_Month");
    }
}

public class PayslipConfiguration : IEntityTypeConfiguration<Payslip>
{
    public void Configure(EntityTypeBuilder<Payslip> b)
    {
        b.ToTable("Payslips");
        b.HasKey(s => s.Id);
        b.Property(s => s.EmployeeName).IsRequired().HasMaxLength(200);
        foreach (var col in new[] { nameof(Payslip.Gross), nameof(Payslip.Deductions), nameof(Payslip.Net) })
            b.Property(col).HasColumnType("decimal(18,2)");
        b.HasIndex(s => s.PayRunId).HasDatabaseName("IX_Payslips_PayRunId");
    }
}
