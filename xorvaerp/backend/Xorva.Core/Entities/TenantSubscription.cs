namespace Xorva.Core.Entities;

/// <summary>
/// What a tenant has subscribed to (and pays for) at the ORGANISATION level — the source
/// of truth for which business modules the tenant may use. A company can only activate a
/// module (<see cref="Company.ActiveModules"/>) that its tenant subscribes to here.
///
/// One row per tenant. Core platform modules (Auth, Tenants, Approvals, Platform) are
/// always available and are never listed here — only the optional business modules
/// (HR, Accounting, Commerce, …).
/// </summary>
public class TenantSubscription : TenantEntity
{
    /// <summary>Billing plan identifier (e.g. "starter", "pro", "custom"). Free-form for now.</summary>
    public string PlanKey { get; set; } = "custom";

    /// <summary>The subscribable module keys the tenant has enabled. Stored as a PostgreSQL text[].</summary>
    public List<string> SubscribedModules { get; set; } = [];
}
