namespace Xorva.Core.Entities;

/// <summary>
/// A legal entity inside a Tenant (e.g. "RightSource Trading LLC").
/// Modules are activated PER COMPANY — each company subscribes only to what it needs.
///
/// Company is TENANT-scoped (not company-scoped): a Company row IS the company,
/// so it carries no CompanyId. Whether a caller may see sibling companies is
/// role-based visibility, enforced in query handlers (SuperAdmin: all,
/// CompanyAdmin and below: own company only).
/// </summary>
public class Company : TenantEntity
{
    public string Name { get; set; } = string.Empty;

    /// <summary>ISO 4217 currency code used for this company's finances.</summary>
    public string Currency { get; set; } = "AED";

    /// <summary>IANA timezone id for this company's reporting and timestamps.</summary>
    public string Timezone { get; set; } = "Asia/Dubai";

    /// <summary>
    /// Module keys activated for this company (see ModuleCatalog).
    /// Stored as a PostgreSQL text[] column.
    /// </summary>
    public List<string> ActiveModules { get; set; } = [];

    public bool IsActive { get; set; } = true;

    public Tenant Tenant { get; set; } = null!;
    public ICollection<Branch> Branches { get; set; } = new List<Branch>();
}
