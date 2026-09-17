using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Common;
using Xorva.Modules.HR.DTOs;
using Xorva.Modules.HR.Entities;
using Xorva.Modules.HR.Enums;

namespace Xorva.Modules.HR.Commands.RunPayroll;

/// <summary>Generates a draft pay run + a payslip per active employee (gross = basic salary).</summary>
public record RunPayrollCommand : IRequest<ApiResponse<PayRunDto>>
{
    public Guid? CompanyId { get; init; }
    public int Year { get; init; }
    public int Month { get; init; }
    public DateTime? PayDate { get; init; }
}

public class RunPayrollValidator : AbstractValidator<RunPayrollCommand>
{
    public RunPayrollValidator()
    {
        RuleFor(x => x.Year).InclusiveBetween(2000, 2100);
        RuleFor(x => x.Month).InclusiveBetween(1, 12);
    }
}

public class RunPayrollHandler : IRequestHandler<RunPayrollCommand, ApiResponse<PayRunDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public RunPayrollHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<PayRunDto>> Handle(RunPayrollCommand request, CancellationToken ct)
    {
        var companyId = HrGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await HrGuard.EnsureHrActiveAsync(_db, companyId, ct);

        var exists = await _db.Set<PayRun>().AnyAsync(p => p.CompanyId == companyId && p.Year == request.Year && p.Month == request.Month, ct);
        if (exists)
            throw new ConflictException($"A pay run for {request.Year}-{request.Month:00} already exists.");

        var employees = await _db.Set<Employee>()
            .Where(e => e.CompanyId == companyId && e.IsActive && e.EmploymentStatus == EmploymentStatus.Active)
            .ToListAsync(ct);
        if (employees.Count == 0)
            throw new BadRequestException("No active employees to run payroll for.");

        var payDate = request.PayDate is { } d
            ? DateTime.SpecifyKind(d.Date, DateTimeKind.Utc)
            : DateTime.SpecifyKind(new DateTime(request.Year, request.Month, DateTime.DaysInMonth(request.Year, request.Month)), DateTimeKind.Utc);

        var payRun = new PayRun
        {
            TenantId = _tenant.TenantId,
            CompanyId = companyId,
            Number = $"PR-{request.Year}-{request.Month:00}",
            Year = request.Year,
            Month = request.Month,
            PayDate = payDate,
            Status = PayRunStatus.Draft,
        };

        foreach (var e in employees)
        {
            var gross = Math.Round(e.BasicSalary, 2);
            payRun.Payslips.Add(new Payslip
            {
                TenantId = _tenant.TenantId,
                CompanyId = companyId,
                PayRunId = payRun.Id,
                EmployeeId = e.Id,
                EmployeeName = e.FullName,
                Gross = gross,
                Deductions = 0m,
                Net = gross,
            });
        }

        payRun.TotalGross = Math.Round(payRun.Payslips.Sum(s => s.Gross), 2);
        payRun.TotalDeductions = Math.Round(payRun.Payslips.Sum(s => s.Deductions), 2);
        payRun.TotalNet = Math.Round(payRun.Payslips.Sum(s => s.Net), 2);

        _db.Set<PayRun>().Add(payRun);
        await _db.SaveChangesAsync(ct);

        return ApiResponse<PayRunDto>.Ok(payRun.ToDto(), $"Pay run created with {payRun.Payslips.Count} payslips.");
    }
}
