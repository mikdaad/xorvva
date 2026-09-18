using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.CostCentres.Entities;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.CostCentres.Commands.DeleteCostCentre;

/// <summary>Deletes an unused cost centre. Anything with journal lines or children must be deactivated instead (the DB trigger enforces the same).</summary>
public record DeleteCostCentreCommand : IRequest<ApiResponse>
{
    public Guid Id { get; init; }
    public Guid? CompanyId { get; init; }
}

public class DeleteCostCentreHandler : IRequestHandler<DeleteCostCentreCommand, ApiResponse>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public DeleteCostCentreHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse> Handle(DeleteCostCentreCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        var cc = await _db.Set<CostCentre>().FirstOrDefaultAsync(c => c.Id == request.Id && c.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Cost centre", request.Id);

        if (await _db.Set<JournalLine>().AnyAsync(l => l.CostCentreId == cc.Id, ct))
            throw new ConflictException($"'{cc.Name}' has journal lines and cannot be deleted. Deactivate it instead.");
        if (await _db.Set<CostCentre>().AnyAsync(c => c.ParentId == cc.Id, ct))
            throw new ConflictException($"'{cc.Name}' still has child cost centres. Delete or move them first.");

        _db.Set<CostCentre>().Remove(cc);
        await _db.SaveChangesAsync(ct);
        return ApiResponse.Ok($"Cost centre '{cc.Name}' deleted.");
    }
}
