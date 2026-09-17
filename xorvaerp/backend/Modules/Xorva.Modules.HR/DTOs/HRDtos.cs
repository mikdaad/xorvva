using System.Text.Json;
using Xorva.Modules.HR.Entities;
using Xorva.Modules.HR.Enums;

namespace Xorva.Modules.HR.DTOs;

/// <summary>One admin-defined department rule (label + value).</summary>
public sealed record DepartmentRuleDto(string Label, string Value);

public record DepartmentDto
{
    public Guid Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string Code { get; init; } = string.Empty;
    public string? Description { get; init; }
    public DepartmentFunction Function { get; init; }
    public Guid? HeadEmployeeId { get; init; }
    public Guid? ParentDepartmentId { get; init; }
    public bool IsActive { get; init; }
    public int EmployeeCount { get; init; }
    public IReadOnlyList<DepartmentRuleDto> Rules { get; init; } = [];
    public DateTime CreatedAt { get; init; }
}

public record DesignationDto
{
    public Guid Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public string? Code { get; init; }
    public string? Category { get; init; }
    public string? Description { get; init; }
    public bool IsActive { get; init; }
    public int EmployeeCount { get; init; }
    public DateTime CreatedAt { get; init; }
}

/// <summary>Lightweight row for the employee list table.</summary>
public record EmployeeSummaryDto
{
    public Guid Id { get; init; }
    public string EmployeeCode { get; init; } = string.Empty;
    public string FullName { get; init; } = string.Empty;
    public string? Email { get; init; }
    public Guid DepartmentId { get; init; }
    public string? DepartmentName { get; init; }
    public Guid DesignationId { get; init; }
    public string? DesignationTitle { get; init; }
    public EmploymentStatus EmploymentStatus { get; init; }
    public EmploymentType EmploymentType { get; init; }
    public DateOnly JoinDate { get; init; }
    /// <summary>Null for callers who may not see salary (Managers).</summary>
    public decimal? BasicSalary { get; init; }
    public string Currency { get; init; } = string.Empty;
    public bool IsActive { get; init; }
}

/// <summary>Full employee profile. Salary omitted for callers without permission (set null).</summary>
public record EmployeeDto
{
    public Guid Id { get; init; }
    public string EmployeeCode { get; init; } = string.Empty;
    public string FirstName { get; init; } = string.Empty;
    public string LastName { get; init; } = string.Empty;
    public string FullName { get; init; } = string.Empty;
    public string? Email { get; init; }
    public string? Phone { get; init; }
    public DateOnly? DateOfBirth { get; init; }
    public Gender Gender { get; init; }
    public string? Nationality { get; init; }
    public string? NationalId { get; init; }
    public MaritalStatus? MaritalStatus { get; init; }
    public string? EmergencyContactName { get; init; }
    public string? EmergencyContactPhone { get; init; }
    public string? EmergencyContactRelation { get; init; }
    public Guid DepartmentId { get; init; }
    public string? DepartmentName { get; init; }
    public Guid DesignationId { get; init; }
    public string? DesignationTitle { get; init; }
    public Guid? ReportingToId { get; init; }
    public string? ReportingToName { get; init; }
    public Guid? BranchId { get; init; }
    public string? BranchName { get; init; }
    public DateOnly JoinDate { get; init; }
    public DateOnly? ProbationEndDate { get; init; }
    public DateOnly? ConfirmationDate { get; init; }
    public EmploymentType EmploymentType { get; init; }
    public EmploymentStatus EmploymentStatus { get; init; }
    /// <summary>Null when the caller may not see salary.</summary>
    public decimal? BasicSalary { get; init; }
    public string Currency { get; init; } = string.Empty;
    public string? BankName { get; init; }
    public string? AccountNumber { get; init; }
    public string? Iban { get; init; }
    public string? Notes { get; init; }
    public string? ProfilePhotoUrl { get; init; }
    public Guid? UserId { get; init; }
    public bool HasUserAccount { get; init; }
    public bool IsActive { get; init; }
    public DateTime CreatedAt { get; init; }
}

public static class HRMappings
{
    /// <summary>Clean + serialize department rules (drops rows with no label). Null when empty.</summary>
    public static string? SerializeRules(IEnumerable<DepartmentRuleDto>? rules)
    {
        var clean = rules?
            .Where(r => !string.IsNullOrWhiteSpace(r.Label))
            .Select(r => new DepartmentRuleDto(r.Label.Trim(), (r.Value ?? string.Empty).Trim()))
            .ToList();
        return clean is { Count: > 0 } ? JsonSerializer.Serialize(clean) : null;
    }

    public static DesignationDto ToDto(this Designation d, int employeeCount = 0) => new()
    {
        Id = d.Id,
        Title = d.Title,
        Code = d.Code,
        Category = d.Category,
        Description = d.Description,
        IsActive = d.IsActive,
        EmployeeCount = employeeCount,
        CreatedAt = d.CreatedAt
    };

    public static DepartmentDto ToDto(this Department d, int employeeCount) => new()
    {
        Id = d.Id,
        Name = d.Name,
        Code = d.Code,
        Description = d.Description,
        Function = d.Function,
        HeadEmployeeId = d.HeadEmployeeId,
        ParentDepartmentId = d.ParentDepartmentId,
        IsActive = d.IsActive,
        EmployeeCount = employeeCount,
        Rules = string.IsNullOrWhiteSpace(d.Rules)
            ? []
            : JsonSerializer.Deserialize<List<DepartmentRuleDto>>(d.Rules!) ?? [],
        CreatedAt = d.CreatedAt
    };
}
