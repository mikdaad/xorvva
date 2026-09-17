using Microsoft.EntityFrameworkCore;
using Xorva.Core.Entities;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Entities;

namespace Xorva.Modules.HR.Common;

/// <summary>
/// Permanently removes an employee and everything that hangs off them — tab records, change
/// history, leave, payslips — plus their linked login (and refresh tokens), and clears any
/// references to them (department head, reporting-to). Stages the removals; the caller saves.
/// </summary>
internal static class EmployeeDeletion
{
    public static async Task HardDeleteAsync(IXorvaDbContext db, Employee employee, CancellationToken ct)
    {
        var id = employee.Id;

        db.Set<EmployeeTabRecord>().RemoveRange(
            await db.Set<EmployeeTabRecord>().Where(r => r.EmployeeId == id).ToListAsync(ct));
        db.Set<EmployeeHistory>().RemoveRange(
            await db.Set<EmployeeHistory>().Where(h => h.EmployeeId == id).ToListAsync(ct));
        db.Set<LeaveRequest>().RemoveRange(
            await db.Set<LeaveRequest>().Where(l => l.EmployeeId == id).ToListAsync(ct));
        db.Set<LeaveAllocation>().RemoveRange(
            await db.Set<LeaveAllocation>().Where(a => a.EmployeeId == id).ToListAsync(ct));
        db.Set<Payslip>().RemoveRange(
            await db.Set<Payslip>().Where(p => p.EmployeeId == id).ToListAsync(ct));

        // Clear references so we don't dangle or FK-block.
        foreach (var dept in await db.Set<Department>().Where(d => d.HeadEmployeeId == id).ToListAsync(ct))
            dept.HeadEmployeeId = null;
        foreach (var report in await db.Set<Employee>().Where(e => e.ReportingToId == id).ToListAsync(ct))
            report.ReportingToId = null;

        // Remove the linked login + its refresh tokens.
        if (employee.UserId is Guid userId)
        {
            db.Set<RefreshToken>().RemoveRange(
                await db.Set<RefreshToken>().IgnoreQueryFilters().Where(t => t.UserId == userId).ToListAsync(ct));
            var user = await db.Set<ApplicationUser>().IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Id == userId, ct);
            if (user is not null) db.Set<ApplicationUser>().Remove(user);
        }

        db.Set<Employee>().Remove(employee);
    }
}
