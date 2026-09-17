using Xorva.Core.Enums;
using Xorva.Core.Interfaces;

namespace Xorva.Infrastructure.Services;

/// <summary>
/// Scoped service that holds the current request's tenant context.
/// Populated by TenantResolverMiddleware from JWT claims.
/// Read by XorvaDbContext for global query filter values.
/// 
/// Lifecycle: Created fresh per HTTP request (Scoped DI).
/// </summary>
public class CurrentTenantService : ICurrentTenantService
{
    public Guid UserId { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid CompanyId { get; private set; }

    /// <summary>
    /// Defaults to Employee (LEAST privilege), never SystemAdmin (enum value 0).
    /// An unauthenticated request must never carry an elevated default role.
    /// </summary>
    public SystemRole Role { get; private set; } = SystemRole.Employee;

    public string Email { get; private set; } = string.Empty;

    /// <summary>SystemAdmin and SuperAdmin operate across all companies in scope.</summary>
    public bool HasCrossCompanyAccess => Role <= SystemRole.SuperAdmin;

    public void SetTenant(Guid userId, Guid tenantId, Guid companyId, SystemRole role, string email)
    {
        UserId = userId;
        TenantId = tenantId;
        CompanyId = companyId;
        Role = role;
        Email = email;
    }
}
