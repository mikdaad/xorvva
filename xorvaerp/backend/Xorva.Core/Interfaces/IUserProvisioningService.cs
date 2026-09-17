using Xorva.Core.Entities;
using Xorva.Core.Enums;

namespace Xorva.Core.Interfaces;

/// <summary>
/// What's needed to create a login (ApplicationUser). Company/Tenant/Department are
/// optional — the implementation pins non-system callers to their own tenant/company.
/// </summary>
public sealed record ProvisionLoginRequest
{
    public string Email { get; init; } = string.Empty;
    public string Password { get; init; } = string.Empty;
    public string FirstName { get; init; } = string.Empty;
    public string LastName { get; init; } = string.Empty;
    public SystemRole Role { get; init; } = SystemRole.Employee;
    public Guid? TenantId { get; init; }
    public Guid? CompanyId { get; init; }
    public Guid? DepartmentId { get; init; }
}

/// <summary>
/// Single code-path for creating a login. Enforces role hierarchy, tenant/company scoping
/// and email uniqueness. Used by RegisterUser (Add User) and by the person-centric
/// CreateEmployee flow (grant a new hire access). Lives in Core so any module can call it
/// without referencing the Auth module.
/// </summary>
public interface IUserProvisioningService
{
    /// <summary>Creates the user and returns it. Throws on role violation, cross-tenant company, or duplicate email.</summary>
    Task<ApplicationUser> ProvisionAsync(ProvisionLoginRequest request, CancellationToken ct);
}
