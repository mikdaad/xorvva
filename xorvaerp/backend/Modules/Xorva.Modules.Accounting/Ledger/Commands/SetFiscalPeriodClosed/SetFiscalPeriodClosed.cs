using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Ledger.Commands.SetFiscalPeriodClosed;

/// <summary>Closes (or re-opens) a fiscal period. Posting into a closed period is rejected.</summary>
public record SetFiscalPeriodClosedCommand : IRequest<ApiResponse<FiscalPeriodDto>>
{
    public Guid Id { get; init; }
    public Guid? CompanyId { get; init; }
    public bool IsClosed { get; init; }
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

        period.IsClosed = request.IsClosed;
        await _db.SaveChangesAsync(ct);
        return ApiResponse<FiscalPeriodDto>.Ok(period.ToDto(), request.IsClosed ? "Period closed." : "Period re-opened.");
    }
}
