using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Ledger.Commands.SetFiscalPeriodClosed;

/// <summary>
/// Closes or re-opens a fiscal period. Two ways to call it:
///  * legacy <see cref="IsClosed"/> — true → HardClosed, false → Open (unchanged API contract and behaviour);
///  * <see cref="CloseStatus"/> — explicit Open / SoftClosed / HardClosed (TrueLedge graded close).
/// SoftClosed still lets CompanyAdmin+ post adjustments; HardClosed blocks everyone
/// (enforced by <see cref="PeriodGuard"/> and by the <c>trg_journal_entries_period</c> trigger).
/// Rules mirror the SQL side: only CompanyAdmin+ may change close state (both paths), and the explicit
/// <see cref="CloseStatus"/> path — like <c>accounting.set_period_close_status</c> — requires every earlier
/// period of the year to be at least soft-closed before hard-closing. The legacy flag path keeps its
/// original single-period behaviour (the DB trigger path has no ordering rule either).
/// </summary>
public record SetFiscalPeriodClosedCommand : IRequest<ApiResponse<FiscalPeriodDto>>
{
    public Guid Id { get; init; }
    public Guid? CompanyId { get; init; }
    public bool IsClosed { get; init; }
    public PeriodCloseStatus? CloseStatus { get; init; }
}

public class SetFiscalPeriodClosedHandler : IRequestHandler<SetFiscalPeriodClosedCommand, ApiResponse<FiscalPeriodDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public SetFiscalPeriodClosedHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<FiscalPeriodDto>> Handle(SetFiscalPeriodClosedCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var period = await _db.Set<FiscalPeriod>()
            .FirstOrDefaultAsync(p => p.Id == request.Id && p.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Fiscal period", request.Id);

        var target = request.CloseStatus ?? (request.IsClosed ? PeriodCloseStatus.HardClosed : PeriodCloseStatus.Open);

        if (_tenant.Role > SystemRole.CompanyAdmin)
            throw new ForbiddenException("Only a company administrator can open or close accounting periods.");

        if (request.CloseStatus == PeriodCloseStatus.HardClosed)
        {
            var earlierOpen = await _db.Set<FiscalPeriod>()
                .Where(p => p.FiscalYearId == period.FiscalYearId && p.StartDate < period.StartDate && p.CloseStatus == PeriodCloseStatus.Open)
                .OrderBy(p => p.StartDate)
                .Select(p => p.Name)
                .FirstOrDefaultAsync(ct);
            if (earlierOpen is not null)
                throw new BadRequestException($"Close the earlier periods of this fiscal year before hard-closing '{period.Name}' ('{earlierOpen}' is still open).");
        }

        period.CloseStatus = target;
        period.IsClosed = target != PeriodCloseStatus.Open;
        period.ClosedAt = period.IsClosed ? DateTime.UtcNow : null;
        period.ClosedBy = period.IsClosed ? _tenant.UserId : null;
        await _db.SaveChangesAsync(ct);

        var message = target switch
        {
            PeriodCloseStatus.HardClosed => "Period hard-closed — no further postings.",
            PeriodCloseStatus.SoftClosed => "Period closed — administrators can still post adjustments.",
            _ => "Period re-opened.",
        };
        return ApiResponse<FiscalPeriodDto>.Ok(period.ToDto(), message);
    }
}
