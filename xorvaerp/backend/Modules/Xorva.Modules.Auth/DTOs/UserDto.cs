using Xorva.Core.Enums;

namespace Xorva.Modules.Auth.DTOs;

/// <summary>
/// User data transfer object. Never exposes password hash.
/// Returned by all auth endpoints that return user information.
/// </summary>
public record UserDto
{
    public Guid Id { get; init; }
    public string Email { get; init; } = string.Empty;
    public string FirstName { get; init; } = string.Empty;
    public string LastName { get; init; } = string.Empty;
    public string FullName { get; init; } = string.Empty;
    public SystemRole Role { get; init; }
    public Guid? TenantId { get; init; }
    public Guid? CompanyId { get; init; }
    public bool IsActive { get; init; }
    public DateTime? LastLoginAt { get; init; }
    public DateTime CreatedAt { get; init; }
}
