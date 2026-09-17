namespace Xorva.Core.Enums;

/// <summary>
/// Hierarchical role system. Lower numeric value = higher privilege.
/// This ordering is critical for the role comparison logic:
/// A user can only create users with a role value GREATER than their own.
/// </summary>
public enum SystemRole
{
    /// <summary>
    /// Xorva platform owners. Manages all tenants, billing, system health.
    /// Scope: Global (all tenants). Customers never see this role.
    /// </summary>
    SystemAdmin = 0,

    /// <summary>
    /// Corporation CEO / Owner. Sees all companies within their tenant.
    /// Scope: Entire Tenant (all companies). Created during tenant registration.
    /// </summary>
    SuperAdmin = 1,

    /// <summary>
    /// General Manager of a specific company within a tenant.
    /// Scope: One Company. Manages users, modules, and settings for their company.
    /// </summary>
    CompanyAdmin = 2,

    /// <summary>
    /// Department Head (e.g., HR Manager, Sales Manager).
    /// Scope: One Department. Approves leave, manages department data and reports.
    /// </summary>
    Manager = 3,

    /// <summary>
    /// Regular staff member.
    /// Scope: Self Only. Views own profile, applies for leave, views own payslips.
    /// </summary>
    Employee = 4
}
