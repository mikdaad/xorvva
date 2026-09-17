using Xorva.Core.Enums;

namespace Xorva.Core.Interfaces;

/// <summary>
/// Provides the current authenticated user's tenant context.
/// Injected as a scoped service — resolved per HTTP request.
/// The TenantResolverMiddleware populates this from JWT claims.
/// The DbContext uses this to apply global query filters.
/// </summary>
public interface ICurrentTenantService
{
    /// <summary>The authenticated user's unique identifier.</summary>
    Guid UserId { get; }

    /// <summary>The tenant (corporation) the user belongs to.</summary>
    Guid TenantId { get; }

    /// <summary>The specific company the user operates within.</summary>
    Guid CompanyId { get; }

    /// <summary>The user's role in the system hierarchy.</summary>
    SystemRole Role { get; }

    /// <summary>The user's email address from JWT claims.</summary>
    string Email { get; }

    /// <summary>
    /// True when the caller may see data across ALL companies in their tenant
    /// (SystemAdmin and SuperAdmin). Drives the company-level query filter:
    /// CompanyAdmin/Manager/Employee are confined to their own CompanyId.
    /// </summary>
    bool HasCrossCompanyAccess { get; }

    /// <summary>
    /// Sets the tenant context from the authenticated user's JWT claims.
    /// Called by TenantResolverMiddleware on each request.
    /// </summary>
    void SetTenant(Guid userId, Guid tenantId, Guid companyId, SystemRole role, string email);
}
