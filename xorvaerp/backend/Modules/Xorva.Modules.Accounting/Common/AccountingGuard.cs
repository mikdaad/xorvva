using Microsoft.EntityFrameworkCore;
using Xorva.Core.Constants;
using Xorva.Core.Entities;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;

namespace Xorva.Modules.Accounting.Common;

/// <summary>
/// Company-context + module-activation guard for Accounting handlers — the exact
/// mirror of <c>HrGuard</c>. Every mutating handler resolves the target company and
/// confirms the company has the Accounting module switched on.
/// </summary>
public static class AccountingGuard
{
    /// <summary>
    /// Resolves which company a command targets. A cross-company caller (CEO) may target
    /// any company via <paramref name="requestedCompanyId"/>; everyone else is pinned to
    /// their own company from the tenant context.
    /// </summary>
    public static Guid ResolveCompanyId(ICurrentTenantService tenant, Guid? requestedCompanyId)
    {
        var companyId = tenant.HasCrossCompanyAccess && requestedCompanyId.HasValue
            ? requestedCompanyId.Value
            : tenant.CompanyId;

        if (companyId == Guid.Empty)
            throw new BadRequestException(
                "No company context. Use a Company Admin account, or specify the target company.");

        return companyId;
    }

    /// <summary>
    /// Company scope for a REPORT. A cross-company caller (CEO) that omits the company gets a
    /// CONSOLIDATED, tenant-wide scope — returned as <c>null</c>. Because the global query filter
    /// already confines a CEO to their own tenant's companies, a null scope safely spans every
    /// company in the tenant and nothing beyond it. Everyone else is pinned to a single company.
    /// Use as: <c>where (scope == null || x.CompanyId == scope)</c>.
    /// </summary>
    public static Guid? ResolveReportScope(ICurrentTenantService tenant, Guid? requestedCompanyId)
    {
        if (tenant.HasCrossCompanyAccess)
            return requestedCompanyId;   // null → consolidated across the tenant; a value → that company
        return ResolveCompanyId(tenant, requestedCompanyId);
    }

    /// <summary>Throws unless the company has the Accounting module activated.</summary>
    public static Task EnsureAccountingActiveAsync(IXorvaDbContext db, Guid companyId, CancellationToken ct)
        => EnsureModuleActiveAsync(db, companyId, ModuleCatalog.Accounting, ct);

    /// <summary>Throws unless the company has the Sales &amp; CRM module activated.</summary>
    public static Task EnsureSalesActiveAsync(IXorvaDbContext db, Guid companyId, CancellationToken ct)
        => EnsureModuleActiveAsync(db, companyId, ModuleCatalog.Sales, ct);

    /// <summary>Throws unless the company has the given module activated.</summary>
    public static async Task EnsureModuleActiveAsync(IXorvaDbContext db, Guid companyId, string moduleKey, CancellationToken ct)
    {
        if (!await IsModuleActiveAsync(db, companyId, moduleKey, ct))
            throw new ForbiddenException($"The {moduleKey} module is not activated for this company.");
    }

    /// <summary>
    /// True if the company has the given module activated. Lets a module SOFT-LINK to another:
    /// e.g. Sales records an invoice on its own, and only posts to the ledger when the company
    /// also has Accounting active.
    /// </summary>
    public static async Task<bool> IsModuleActiveAsync(IXorvaDbContext db, Guid companyId, string moduleKey, CancellationToken ct)
    {
        var company = await db.Set<Company>()
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(c => c.Id == companyId, ct)
            ?? throw new NotFoundException("Company", companyId);

        return company.ActiveModules.Contains(moduleKey);
    }
}
