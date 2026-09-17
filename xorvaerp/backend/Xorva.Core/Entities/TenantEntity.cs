namespace Xorva.Core.Entities;

/// <summary>
/// Base entity for TENANT-scoped data — rows that belong to a tenant but are
/// visible across all of that tenant's companies (e.g. Company itself).
///
/// The DbContext applies a global query filter: WHERE TenantId = @currentTenant.
/// Tenant isolation is a SECURITY boundary and lives in the filter (invariant);
/// company visibility is an AUTHORIZATION scope and is handled by CompanyEntity's
/// conditional filter or in handlers.
/// </summary>
public abstract class TenantEntity : AuditableEntity
{
    /// <summary>
    /// The top-level tenant (corporation) this entity belongs to.
    /// </summary>
    public Guid TenantId { get; set; }
}
