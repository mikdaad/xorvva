using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Banking.Commands.SetLineReconciled;

/// <summary>Marks a bank journal line reconciled (matched to the statement) or not.</summary>
public record SetLineReconciledCommand : IRequest<ApiResponse<bool>>
{
    public Guid Id { get; init; }
    public Guid? CompanyId { get; init; }
    public bool IsReconciled { get; init; }
}

public class SetLineReconciledHandler : IRequestHandler<SetLineReconciledCommand, ApiResponse<bool>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public SetLineReconciledHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<bool>> Handle(SetLineReconciledCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var line = await _db.Set<JournalLine>()
            .FirstOrDefaultAsync(l => l.Id == request.Id && l.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Journal line", request.Id);

        line.IsReconciled = request.IsReconciled;
        await _db.SaveChangesAsync(ct);
        return ApiResponse<bool>.Ok(line.IsReconciled, request.IsReconciled ? "Line reconciled." : "Line unreconciled.");
    }
}
