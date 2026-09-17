using Microsoft.EntityFrameworkCore;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.DTOs;
using Xorva.Modules.HR.Entities;

namespace Xorva.Modules.HR.Common;

internal static class EmployeeMapper
{
    /// <summary>
    /// Salary is visible to CompanyAdmin and above, or to the employee viewing their
    /// own profile. Managers see employees but not their salary.
    /// </summary>
    public static bool CanSeeSalary(ICurrentTenantService tenant, Employee e) =>
        (int)tenant.Role <= (int)SystemRole.CompanyAdmin || e.UserId == tenant.UserId;

    /// <summary>Builds a full EmployeeDto, resolving related names. Salary respected by permission.</summary>
    public static async Task<EmployeeDto> ToDtoAsync(
        this Employee e, IXorvaDbContext db, ICurrentTenantService tenant, CancellationToken ct)
    {
        var deptName = await db.Set<Department>()
            .Where(d => d.Id == e.DepartmentId).Select(d => d.Name).FirstOrDefaultAsync(ct);
        var desigTitle = await db.Set<Designation>()
            .Where(d => d.Id == e.DesignationId).Select(d => d.Title).FirstOrDefaultAsync(ct);
        string? reportingToName = null;
        if (e.ReportingToId.HasValue)
            reportingToName = await db.Set<Employee>()
                .Where(x => x.Id == e.ReportingToId.Value)
                .Select(x => x.FirstName + " " + x.LastName).FirstOrDefaultAsync(ct);
        string? branchName = null;
        if (e.BranchId.HasValue)
            branchName = await db.Set<Branch>()
                .Where(b => b.Id == e.BranchId.Value).Select(b => b.Name).FirstOrDefaultAsync(ct);

        return new EmployeeDto
        {
            Id = e.Id,
            EmployeeCode = e.EmployeeCode,
            FirstName = e.FirstName,
            LastName = e.LastName,
            FullName = e.FullName,
            Email = e.Email,
            Phone = e.Phone,
            DateOfBirth = e.DateOfBirth,
            Gender = e.Gender,
            Nationality = e.Nationality,
            NationalId = e.NationalId,
            MaritalStatus = e.MaritalStatus,
            EmergencyContactName = e.EmergencyContactName,
            EmergencyContactPhone = e.EmergencyContactPhone,
            EmergencyContactRelation = e.EmergencyContactRelation,
            DepartmentId = e.DepartmentId,
            DepartmentName = deptName,
            DesignationId = e.DesignationId,
            DesignationTitle = desigTitle,
            ReportingToId = e.ReportingToId,
            ReportingToName = reportingToName,
            BranchId = e.BranchId,
            BranchName = branchName,
            JoinDate = e.JoinDate,
            ProbationEndDate = e.ProbationEndDate,
            ConfirmationDate = e.ConfirmationDate,
            EmploymentType = e.EmploymentType,
            EmploymentStatus = e.EmploymentStatus,
            BasicSalary = CanSeeSalary(tenant, e) ? e.BasicSalary : null,
            Currency = e.Currency,
            BankName = e.BankName,
            AccountNumber = e.AccountNumber,
            Iban = e.Iban,
            Notes = e.Notes,
            ProfilePhotoUrl = e.ProfilePhotoUrl,
            UserId = e.UserId,
            HasUserAccount = e.UserId.HasValue,
            IsActive = e.IsActive,
            CreatedAt = e.CreatedAt
        };
    }

    /// <summary>Validates that every cross-reference on an employee belongs to the same company.</summary>
    public static async Task ValidateReferencesAsync(
        IXorvaDbContext db, Guid companyId, Guid departmentId, Guid designationId,
        Guid? reportingToId, Guid? branchId, Guid? userId, Guid? selfId, CancellationToken ct)
    {
        if (!await db.Set<Department>().AnyAsync(d => d.Id == departmentId && d.CompanyId == companyId && d.IsActive, ct))
            throw new Core.Exceptions.BadRequestException("Department not found in this company.");

        if (!await db.Set<Designation>().AnyAsync(d => d.Id == designationId && d.CompanyId == companyId && d.IsActive, ct))
            throw new Core.Exceptions.BadRequestException("Designation not found in this company.");

        if (reportingToId.HasValue)
        {
            if (selfId.HasValue && reportingToId.Value == selfId.Value)
                throw new Core.Exceptions.BadRequestException("An employee cannot report to themselves.");
            if (!await db.Set<Employee>().AnyAsync(e => e.Id == reportingToId.Value && e.CompanyId == companyId, ct))
                throw new Core.Exceptions.BadRequestException("Reporting-to employee not found in this company.");
        }

        if (branchId.HasValue &&
            !await db.Set<Branch>().AnyAsync(b => b.Id == branchId.Value && b.CompanyId == companyId, ct))
            throw new Core.Exceptions.BadRequestException("Branch not found in this company.");

        if (userId.HasValue &&
            !await db.Set<ApplicationUser>().IgnoreQueryFilters()
                .AnyAsync(u => u.Id == userId.Value && u.CompanyId == companyId, ct))
            throw new Core.Exceptions.BadRequestException("Linked user account not found in this company.");
    }

    /// <summary>Generates the next per-company EmployeeCode (EMP-0001, EMP-0002, …).</summary>
    public static async Task<string> NextEmployeeCodeAsync(IXorvaDbContext db, Guid companyId, CancellationToken ct)
    {
        var codes = await db.Set<Employee>().IgnoreQueryFilters()
            .Where(e => e.CompanyId == companyId && e.EmployeeCode.StartsWith("EMP-"))
            .Select(e => e.EmployeeCode)
            .ToListAsync(ct);

        var max = codes
            .Select(c => int.TryParse(c[4..], out var n) ? n : 0)
            .DefaultIfEmpty(0)
            .Max();

        return $"EMP-{max + 1:D4}";
    }
}
