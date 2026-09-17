using Xorva.Core.Entities;

namespace Xorva.Modules.Tenants.DTOs;

public record TenantDto
{
    public Guid Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string ContactEmail { get; init; } = string.Empty;
    public bool IsActive { get; init; }
    public DateTime CreatedAt { get; init; }
    public int CompanyCount { get; init; }
    /// <summary>Null until the CEO finishes/skips onboarding — drives first-login routing.</summary>
    public DateTime? OnboardedAt { get; init; }
}

public record CompanyDto
{
    public Guid Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string Currency { get; init; } = string.Empty;
    public string Timezone { get; init; } = string.Empty;
    public List<string> ActiveModules { get; init; } = [];
    public bool IsActive { get; init; }
    public DateTime CreatedAt { get; init; }
}

public record BranchDto
{
    public Guid Id { get; init; }
    public Guid CompanyId { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Address { get; init; }
    public string? City { get; init; }
    public string? Country { get; init; }
    public bool IsActive { get; init; }
    public DateTime CreatedAt { get; init; }
}

/// <summary>
/// Returned by public tenant signup. Deliberately does NOT include tokens —
/// the frontend chains a normal login call, keeping the Tenants and Auth
/// modules decoupled (modules never reference each other).
/// </summary>
public record TenantSignupResultDto
{
    public Guid TenantId { get; init; }
    public string TenantName { get; init; } = string.Empty;
    public Guid CompanyId { get; init; }
    public string CompanyName { get; init; } = string.Empty;
    public string AdminEmail { get; init; } = string.Empty;
}

public static class TenantMappings
{
    public static CompanyDto ToDto(this Company c) => new()
    {
        Id = c.Id,
        Name = c.Name,
        Currency = c.Currency,
        Timezone = c.Timezone,
        ActiveModules = c.ActiveModules,
        IsActive = c.IsActive,
        CreatedAt = c.CreatedAt
    };

    public static BranchDto ToDto(this Branch b) => new()
    {
        Id = b.Id,
        CompanyId = b.CompanyId,
        Name = b.Name,
        Address = b.Address,
        City = b.City,
        Country = b.Country,
        IsActive = b.IsActive,
        CreatedAt = b.CreatedAt
    };
}
