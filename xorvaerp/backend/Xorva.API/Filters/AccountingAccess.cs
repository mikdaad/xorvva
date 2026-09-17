using Microsoft.EntityFrameworkCore;
using Xorva.Core.Enums;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Entities;
using Xorva.Modules.HR.Enums;

namespace Xorva.API.Filters;

/// <summary>
/// The department-function access rule for Accounting. Company Admin &amp; above always have
/// finance access; a Manager has it <b>iff</b> they head a department whose Function is
/// Accounting (an Accounting-department manager IS the accountant). Everyone else: no access.
/// Authoritative check — the frontend only mirrors it for nav visibility.
/// </summary>
public static class AccountingAccess
{
    public static Task<bool> HasAsync(IServiceProvider services, CancellationToken ct)
    {
        var tenant = services.GetRequiredService<ICurrentTenantService>();
        var db = services.GetRequiredService<IXorvaDbContext>();
        return HasAsync(tenant, db, ct);
    }

    /// <summary>Testable core — same rule, explicit dependencies.</summary>
    public static async Task<bool> HasAsync(ICurrentTenantService tenant, IXorvaDbContext db, CancellationToken ct)
    {
        if (tenant.Role <= SystemRole.CompanyAdmin) return true;      // SystemAdmin, SuperAdmin, CompanyAdmin
        if (tenant.Role != SystemRole.Manager) return false;          // Employee: never
        if (tenant.UserId == Guid.Empty || tenant.CompanyId == Guid.Empty) return false;

        var employeeIds = await db.Set<Employee>()
            .Where(e => e.CompanyId == tenant.CompanyId && e.UserId == tenant.UserId)
            .Select(e => e.Id)
            .ToListAsync(ct);
        if (employeeIds.Count == 0) return false;

        return await db.Set<Department>().AnyAsync(d =>
            d.CompanyId == tenant.CompanyId
            && d.Function == DepartmentFunction.Accounting
            && d.HeadEmployeeId != null
            && employeeIds.Contains(d.HeadEmployeeId.Value), ct);
    }
}
