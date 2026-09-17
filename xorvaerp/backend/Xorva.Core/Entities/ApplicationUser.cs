using Xorva.Core.Enums;

namespace Xorva.Core.Entities;

/// <summary>
/// The user entity in the Xorva ERP system. Represents any authenticated person.
/// Lives in Core because both Infrastructure (DbContext) and Auth module (handlers) need it.
/// 
/// Design decisions:
/// - Custom lightweight entity, NOT ASP.NET Identity (too heavyweight for multi-tenant ERP)
/// - TenantId/CompanyId are nullable — SystemAdmin operates above tenants
/// - Role stored as enum (5 fixed levels), not a join table
/// </summary>
public class ApplicationUser : BaseEntity
{
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string FullName => $"{FirstName} {LastName}".Trim();
    public SystemRole Role { get; set; } = SystemRole.Employee;
    public Guid? TenantId { get; set; }
    public Guid? CompanyId { get; set; }
    public Guid? DepartmentId { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime? LastLoginAt { get; set; }
    public ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();
}
