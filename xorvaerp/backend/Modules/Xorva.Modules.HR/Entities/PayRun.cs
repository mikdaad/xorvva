using Xorva.Core.Entities;
using Xorva.Modules.HR.Enums;

namespace Xorva.Modules.HR.Entities;

/// <summary>
/// A monthly payroll batch. Lives in HR (it's about employees); posting accrues the salary
/// journal into Accounting via the Core <c>IJournalPoster</c> — HR never references Accounting.
/// </summary>
public class PayRun : CompanyEntity
{
    public string Number { get; set; } = string.Empty;   // PR-2026-01
    public int Year { get; set; }
    public int Month { get; set; }                        // 1–12
    public DateTime PayDate { get; set; }
    public PayRunStatus Status { get; set; } = PayRunStatus.Draft;

    public decimal TotalGross { get; set; }
    public decimal TotalDeductions { get; set; }
    public decimal TotalNet { get; set; }

    /// <summary>The salary journal produced when this run was posted.</summary>
    public Guid? JournalEntryId { get; set; }

    public List<Payslip> Payslips { get; set; } = [];
}

public class Payslip : CompanyEntity
{
    public Guid PayRunId { get; set; }
    public Guid EmployeeId { get; set; }
    public string EmployeeName { get; set; } = string.Empty;   // snapshot at run time
    public decimal Gross { get; set; }
    public decimal Deductions { get; set; }
    public decimal Net { get; set; }
}
