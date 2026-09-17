using Microsoft.EntityFrameworkCore;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Common;

internal static class PeriodGuard
{
    /// <summary>
    /// Rejects posting into a closed period. Permissive when no period covers the date
    /// (i.e. before fiscal periods are set up), so the engine works from day one.
    /// </summary>
    public static async Task EnsureOpenAsync(IXorvaDbContext db, Guid companyId, DateTime date, CancellationToken ct)
    {
        var period = await db.Set<FiscalPeriod>()
            .FirstOrDefaultAsync(p => p.CompanyId == companyId && date >= p.StartDate && date <= p.EndDate, ct);

        if (period is { IsClosed: true })
            throw new BadRequestException($"The accounting period '{period.Name}' is closed — post into an open period.");
    }
}
