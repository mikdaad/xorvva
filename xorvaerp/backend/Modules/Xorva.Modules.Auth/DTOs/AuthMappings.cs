using Xorva.Core.Entities;

namespace Xorva.Modules.Auth.DTOs;

/// <summary>
/// Extension methods for mapping between entities and DTOs.
/// No AutoMapper dependency — explicit mapping is clearer and has zero runtime cost.
/// </summary>
public static class AuthMappings
{
    public static UserDto ToDto(this ApplicationUser user) => new()
    {
        Id = user.Id,
        Email = user.Email,
        FirstName = user.FirstName,
        LastName = user.LastName,
        FullName = user.FullName,
        Role = user.Role,
        TenantId = user.TenantId,
        CompanyId = user.CompanyId,
        IsActive = user.IsActive,
        LastLoginAt = user.LastLoginAt,
        CreatedAt = user.CreatedAt
    };
}
