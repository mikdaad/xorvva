namespace Xorva.API.Dashboard;

/// <summary>
/// Role-shaped dashboard summary. Only the sections relevant to the caller's role are
/// populated; null sections are omitted from the JSON. One round-trip per dashboard load.
/// </summary>
public record DashboardDto
{
    public string Role { get; init; } = string.Empty;

    // Everyone (who can approve)
    public int? PendingApprovalCount { get; init; }
    public List<ApprovalPreviewDto>? PendingApprovals { get; init; }

    // CEO / SuperAdmin
    public int? CompanyCount { get; init; }
    public int? TotalEmployees { get; init; }
    public List<CompanySummaryDto>? Companies { get; init; }

    // Company Admin
    public int? EmployeeCount { get; init; }
    public int? DepartmentCount { get; init; }
    public int? OnLeaveToday { get; init; }
    public List<HireDto>? RecentHires { get; init; }

    // Manager
    public int? TeamSize { get; init; }
    public int? TeamOnLeave { get; init; }

    // Employee
    public EmployeeMiniDto? Profile { get; init; }
    public List<LeaveBalanceMiniDto>? LeaveBalance { get; init; }
}

public record ApprovalPreviewDto
{
    public Guid Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public string RequesterEmail { get; init; } = string.Empty;
    public DateTime CreatedAt { get; init; }
}

public record CompanySummaryDto
{
    public Guid Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public int EmployeeCount { get; init; }
    public List<string> Modules { get; init; } = [];
}

public record HireDto
{
    public string FullName { get; init; } = string.Empty;
    public string? DepartmentName { get; init; }
    public DateTime CreatedAt { get; init; }
}

public record EmployeeMiniDto
{
    public string FullName { get; init; } = string.Empty;
    public string EmployeeCode { get; init; } = string.Empty;
    public string? DepartmentName { get; init; }
    public string? DesignationTitle { get; init; }
    public DateOnly JoinDate { get; init; }
}

public record LeaveBalanceMiniDto
{
    public string LeaveTypeName { get; init; } = string.Empty;
    public decimal TotalDays { get; init; }
    public decimal UsedDays { get; init; }
    public decimal RemainingDays { get; init; }
}

/// <summary>Platform overview for the SystemAdmin (Xorva team) — cross-tenant stats.</summary>
public record AdminOverviewDto
{
    public int TenantCount { get; init; }
    public int CompanyCount { get; init; }
    public int UserCount { get; init; }
    public int EmployeeCount { get; init; }
    public List<TenantSignupDto> RecentSignups { get; init; } = [];
}

public record TenantSignupDto
{
    public string Name { get; init; } = string.Empty;
    public string ContactEmail { get; init; } = string.Empty;
    public int CompanyCount { get; init; }
    public DateTime CreatedAt { get; init; }
}
