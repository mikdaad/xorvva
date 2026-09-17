using Microsoft.EntityFrameworkCore;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Entities;

namespace Xorva.Modules.HR.Common;

internal static class LeaveHelpers
{
    /// <summary>Company holiday dates within a year, as a lookup set.</summary>
    public static async Task<HashSet<DateOnly>> HolidaySetAsync(
        IXorvaDbContext db, Guid companyId, int year, CancellationToken ct)
    {
        var dates = await db.Set<Holiday>()
            .Where(h => h.CompanyId == companyId && h.IsActive && h.Date.Year == year)
            .Select(h => h.Date)
            .ToListAsync(ct);
        return dates.ToHashSet();
    }

    /// <summary>Resolves the target employee: an explicit id, or the caller's own linked record.</summary>
    public static async Task<Employee> ResolveEmployeeAsync(
        IXorvaDbContext db, ICurrentTenantService tenant, Guid? employeeId, CancellationToken ct)
    {
        if (employeeId.HasValue)
            return await db.Set<Employee>().FirstOrDefaultAsync(e => e.Id == employeeId.Value, ct)
                ?? throw new NotFoundException("Employee", employeeId.Value);

        return await db.Set<Employee>().FirstOrDefaultAsync(e => e.UserId == tenant.UserId, ct)
            ?? throw new NotFoundException("No employee profile is linked to your account.");
    }

    /// <summary>Gets or lazily creates the employee's allocation for a leave type + year.</summary>
    public static async Task<LeaveAllocation> GetOrCreateAllocationAsync(
        IXorvaDbContext db, Employee employee, LeaveType type, int year, CancellationToken ct)
    {
        var allocation = await db.Set<LeaveAllocation>()
            .FirstOrDefaultAsync(a => a.EmployeeId == employee.Id && a.LeaveTypeId == type.Id && a.Year == year, ct);

        if (allocation is not null)
            return allocation;

        allocation = new LeaveAllocation
        {
            TenantId = employee.TenantId,
            CompanyId = employee.CompanyId,
            EmployeeId = employee.Id,
            LeaveTypeId = type.Id,
            Year = year,
            TotalDays = type.DefaultDays,
            UsedDays = 0
        };
        db.Set<LeaveAllocation>().Add(allocation);
        return allocation;
    }
}
