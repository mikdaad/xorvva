using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Currency.Entities;

namespace Xorva.Modules.Accounting.Currency.Commands.DeleteExchangeRate;

public record DeleteExchangeRateCommand(Guid Id, Guid? CompanyId = null) : IRequest<ApiResponse<bool>>;

public class DeleteExchangeRateHandler : IRequestHandler<DeleteExchangeRateCommand, ApiResponse<bool>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public DeleteExchangeRateHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<bool>> Handle(DeleteExchangeRateCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        var rate = await _db.Set<ExchangeRate>()
            .FirstOrDefaultAsync(r => r.Id == request.Id && r.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Exchange rate", request.Id);

        _db.Set<ExchangeRate>().Remove(rate);
        await _db.SaveChangesAsync(ct);
        return ApiResponse<bool>.Ok(true, "Exchange rate removed.");
    }
}
