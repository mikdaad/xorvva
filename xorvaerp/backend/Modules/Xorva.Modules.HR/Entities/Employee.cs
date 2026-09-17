using Xorva.Core.Entities;
using Xorva.Modules.HR.Enums;

namespace Xorva.Modules.HR.Entities;

/// <summary>
/// The person record. Company-scoped. Distinct from ApplicationUser (login identity):
/// not every employee logs in, not every user is an employee. Optional 1:1 via UserId.
/// </summary>
public class Employee : CompanyEntity
{
    // ─── Identity ───────────────────────────────────────────────
    /// <summary>Auto-generated per company, e.g. "EMP-0001".</summary>
    public string EmployeeCode { get; set; } = string.Empty;

    // ─── Personal ───────────────────────────────────────────────
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string FullName => $"{FirstName} {LastName}".Trim();
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public DateOnly? DateOfBirth { get; set; }
    public Gender Gender { get; set; } = Gender.Other;
    public string? Nationality { get; set; }
    public string? NationalId { get; set; }
    public MaritalStatus? MaritalStatus { get; set; }

    // ─── Emergency contact (ERP-completeness addition) ──────────
    public string? EmergencyContactName { get; set; }
    public string? EmergencyContactPhone { get; set; }
    public string? EmergencyContactRelation { get; set; }

    // ─── Employment ─────────────────────────────────────────────
    public Guid DepartmentId { get; set; }
    public Guid DesignationId { get; set; }
    public Guid? ReportingToId { get; set; }   // direct manager (self-ref)
    public Guid? BranchId { get; set; }         // work location (Tenants.Branch)
    public DateOnly JoinDate { get; set; }
    public DateOnly? ProbationEndDate { get; set; }
    public DateOnly? ConfirmationDate { get; set; }
    public EmploymentType EmploymentType { get; set; } = EmploymentType.FullTime;
    public EmploymentStatus EmploymentStatus { get; set; } = EmploymentStatus.Active;
    public decimal BasicSalary { get; set; }
    public string Currency { get; set; } = "AED";

    // ─── Bank ───────────────────────────────────────────────────
    public string? BankName { get; set; }
    public string? AccountNumber { get; set; }
    public string? Iban { get; set; }

    // ─── System ─────────────────────────────────────────────────
    /// <summary>Optional link to a login account (ApplicationUser). Same company only.</summary>
    public Guid? UserId { get; set; }
    public bool IsActive { get; set; } = true;
    public string? Notes { get; set; }
    public string? ProfilePhotoUrl { get; set; }
}
