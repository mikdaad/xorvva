using Microsoft.EntityFrameworkCore;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Common;

internal static class PeriodGuard
{
    /// <summary>
    /// Rejects posting into a closed period. Permissive when no period covers the date
    /// (i.e. before fiscal periods are set up), so the engine works from day one.
    ///
    /// Soft/hard close (ported from TrueLedge, mirrors <c>accounting.assert_period_open</c>):
    ///  * HardClosed — nobody may post.
    ///  * SoftClosed — Company Admin and above may still post adjustments; Manager/Employee may not.
    ///  * Legacy rows that only carry <c>IsClosed = true</c> are treated as HardClosed
    ///    (the database trigger keeps the two columns in step, so this is belt-and-braces).
    /// The database trigger <c>trg_journal_entries_period</c> enforces the same rule on the
    /// SQL path, so the two engines can never disagree.
    /// </summary>
    public static async Task EnsureOpenAsync(IXorvaDbContext db, Guid companyId, DateTime date, CancellationToken ct, SystemRole? callerRole = null)
    {
        var period = await db.Set<FiscalPeriod>()
            .FirstOrDefaultAsync(p => p.CompanyId == companyId && date >= p.StartDate && date <= p.EndDate, ct);

        if (period is null) return;

        var status = period.CloseStatus;
        if (status == PeriodCloseStatus.Open && period.IsClosed)
            status = PeriodCloseStatus.HardClosed;

        switch (status)
        {
            case PeriodCloseStatus.HardClosed:
                throw new BadRequestException($"The accounting period '{period.Name}' is closed — post into an open period.");

            case PeriodCloseStatus.SoftClosed when callerRole is null || callerRole > SystemRole.CompanyAdmin:
                throw new BadRequestException(
                    $"The accounting period '{period.Name}' is soft-closed — only a company administrator can post adjustments to it.");
        }
    }
}
