using Microsoft.EntityFrameworkCore;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Entities;
using Xorva.Modules.HR.Enums;

namespace Xorva.Modules.HR.Common;

/// <summary>
/// Shared HR rules: resolve the company an action targets, verify HR is active for
/// that company, and validate that cross-references stay within the same company.
/// </summary>
internal static class HrGuard
{
    /// <summary>
    /// The company this HR action operates in. CompanyAdmin/Manager act in their own
    /// company; a CEO (cross-company) may target any company in the tenant by passing
    /// requestedCompanyId. Throws if there is no company context.
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

    /// <summary>Ensures the target company exists in the tenant and has the HR module activated.</summary>
    public static async Task EnsureHrActiveAsync(IXorvaDbContext db, Guid companyId, CancellationToken ct)
    {
        var company = await db.Set<Company>()
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(c => c.Id == companyId, ct)
            ?? throw new NotFoundException("Company", companyId);

        if (!company.ActiveModules.Contains("HR"))
            throw new ForbiddenException("The HR module is not activated for this company.");
    }

    /// <summary>The department the calling user belongs to (from their login account), or null.</summary>
    public static Task<Guid?> GetCallerDepartmentIdAsync(IXorvaDbContext db, ICurrentTenantService tenant, CancellationToken ct) =>
        db.Set<ApplicationUser>().IgnoreQueryFilters()
            .Where(u => u.Id == tenant.UserId)
            .Select(u => u.DepartmentId)
            .FirstOrDefaultAsync(ct);

    /// <summary>
    /// Who may DESIGN the employee record (add / edit / remove tabs and fields):
    /// CompanyAdmin and above, or a Manager who heads an HR-function department.
    /// </summary>
    public static async Task EnsureCanDesignTabsAsync(
        IXorvaDbContext db, ICurrentTenantService tenant, CancellationToken ct)
    {
        if ((int)tenant.Role <= (int)SystemRole.CompanyAdmin) return; // SystemAdmin / SuperAdmin / CompanyAdmin

        if (tenant.Role == SystemRole.Manager)
        {
            var deptId = await GetCallerDepartmentIdAsync(db, tenant, ct);
            if (deptId is Guid id)
            {
                var fn = await db.Set<Department>().IgnoreQueryFilters()
                    .Where(d => d.Id == id).Select(d => d.Function).FirstOrDefaultAsync(ct);
                if (fn == DepartmentFunction.HR) return;
            }
        }

        throw new ForbiddenException("Only Admins and HR managers can design the employee record.");
    }

    /// <summary>
    /// A Manager may only act on employees in their own department. CompanyAdmin and
    /// above act across the whole company (the query filter already scopes to it).
    /// </summary>
    public static async Task EnsureCanManageEmployeeAsync(
        IXorvaDbContext db, ICurrentTenantService tenant, Employee employee, CancellationToken ct)
    {
        if (tenant.Role != SystemRole.Manager)
            return;

        var deptId = await GetCallerDepartmentIdAsync(db, tenant, ct);
        if (deptId is null || employee.DepartmentId != deptId.Value)
            throw new ForbiddenException("You can only manage employees in your own department.");
    }
}
