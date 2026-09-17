namespace Xorva.Core.Entities;

/// <summary>
/// The top-level account: one Tenant = one customer corporation/group
/// (e.g. "RightSource Group"). Contains Companies, which contain Branches.
///
/// Tenant is the ROOT of the hierarchy — it does not extend TenantEntity.
/// It gets its own query filter: Id == currentTenantId (a tenant's users can
/// only ever see their own tenant row; SystemAdmin uses IgnoreQueryFilters).
///
/// Lives in Core (like ApplicationUser) so the Infrastructure DbContext can
/// map it without referencing the Tenants module — documented Phase-1 tradeoff.
/// </summary>
public class Tenant : AuditableEntity
{
    public string Name { get; set; } = string.Empty;

    /// <summary>Contact email of the account owner (the CEO who signed up).</summary>
    public string ContactEmail { get; set; } = string.Empty;

    /// <summary>Soft-disable switch for the whole account (billing, offboarding).</summary>
    public bool IsActive { get; set; } = true;

    /// <summary>
    /// Stamped when the CEO completes (or skips) the first-login onboarding wizard.
    /// Null = not onboarded → the frontend routes first login to the wizard.
    /// Server-side so it works across devices.
    /// </summary>
    public DateTime? OnboardedAt { get; set; }

    public ICollection<Company> Companies { get; set; } = new List<Company>();
}
