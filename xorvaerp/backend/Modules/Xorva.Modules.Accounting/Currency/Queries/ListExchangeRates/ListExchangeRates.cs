using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Currency.Entities;
using Xorva.Modules.Accounting.DTOs;

namespace Xorva.Modules.Accounting.Currency.Queries.ListExchangeRates;

public record ListExchangeRatesQuery : IRequest<ApiResponse<List<ExchangeRateDto>>>
{
    public Guid? CompanyId { get; init; }
}

public class ListExchangeRatesHandler : IRequestHandler<ListExchangeRatesQuery, ApiResponse<List<ExchangeRateDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public ListExchangeRatesHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<ExchangeRateDto>>> Handle(ListExchangeRatesQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        var rates = await _db.Set<ExchangeRate>()
            .Where(r => r.CompanyId == companyId)
            .OrderBy(r => r.CurrencyCode).ThenByDescending(r => r.RateDate)
            .Select(r => r.ToDto())
            .ToListAsync(ct);
        return ApiResponse<List<ExchangeRateDto>>.Ok(rates);
    }
}
