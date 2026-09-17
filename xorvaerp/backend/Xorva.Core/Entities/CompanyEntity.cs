namespace Xorva.Core.Entities;

/// <summary>
/// Base entity for COMPANY-scoped data — the workhorse base class for business
/// modules (Branches, Departments, Employees, Invoices, ...).
///
/// The DbContext applies a global query filter:
///   WHERE TenantId = @currentTenant
///     AND (@callerHasCrossCompanyAccess OR CompanyId = @currentCompany)
///
/// So a SuperAdmin (CEO) sees every company's rows in their tenant, while
/// CompanyAdmin / Manager / Employee are physically confined to their own company
/// at the ORM level.
/// </summary>
public abstract class CompanyEntity : TenantEntity
{
    /// <summary>
    /// The specific company within the tenant this entity belongs to.
    /// </summary>
    public Guid CompanyId { get; set; }
}
