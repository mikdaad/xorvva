using Xorva.Modules.HR.Entities;

namespace Xorva.Modules.HR.DTOs;

public record PayslipDto
{
    public Guid Id { get; init; }
    public Guid EmployeeId { get; init; }
    public string EmployeeName { get; init; } = string.Empty;
    public decimal Gross { get; init; }
    public decimal Deductions { get; init; }
    public decimal Net { get; init; }
}

public record PayRunDto
{
    public Guid Id { get; init; }
    public string Number { get; init; } = string.Empty;
    public int Year { get; init; }
    public int Month { get; init; }
    public DateTime PayDate { get; init; }
    public string Status { get; init; } = string.Empty;
    public decimal TotalGross { get; init; }
    public decimal TotalDeductions { get; init; }
    public decimal TotalNet { get; init; }
    public Guid? JournalEntryId { get; init; }
    public List<PayslipDto> Payslips { get; init; } = [];
}

public record PayRunSummaryDto
{
    public Guid Id { get; init; }
    public string Number { get; init; } = string.Empty;
    public int Year { get; init; }
    public int Month { get; init; }
    public DateTime PayDate { get; init; }
    public string Status { get; init; } = string.Empty;
    public decimal TotalNet { get; init; }
    public int EmployeeCount { get; init; }
}

public static class PayrollMappers
{
    public static PayRunDto ToDto(this PayRun p) => new()
    {
        Id = p.Id,
        Number = p.Number,
        Year = p.Year,
        Month = p.Month,
        PayDate = p.PayDate,
        Status = p.Status.ToString(),
        TotalGross = p.TotalGross,
        TotalDeductions = p.TotalDeductions,
        TotalNet = p.TotalNet,
        JournalEntryId = p.JournalEntryId,
        Payslips = [.. p.Payslips.Select(s => new PayslipDto
        {
            Id = s.Id, EmployeeId = s.EmployeeId, EmployeeName = s.EmployeeName,
            Gross = s.Gross, Deductions = s.Deductions, Net = s.Net,
        })],
    };

    public static PayRunSummaryDto ToSummaryDto(this PayRun p, int employeeCount) => new()
    {
        Id = p.Id, Number = p.Number, Year = p.Year, Month = p.Month, PayDate = p.PayDate,
        Status = p.Status.ToString(), TotalNet = p.TotalNet, EmployeeCount = employeeCount,
    };
}
