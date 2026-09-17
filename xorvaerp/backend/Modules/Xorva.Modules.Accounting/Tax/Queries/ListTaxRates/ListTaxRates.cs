using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Tax.Entities;

namespace Xorva.Modules.Accounting.Tax.Queries.ListTaxRates;

public record ListTaxRatesQuery : IRequest<ApiResponse<List<TaxRateDto>>>
{
    public Guid? CompanyId { get; init; }
    public bool IncludeInactive { get; init; }
}

public class ListTaxRatesHandler : IRequestHandler<ListTaxRatesQuery, ApiResponse<List<TaxRateDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public ListTaxRatesHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<TaxRateDto>>> Handle(ListTaxRatesQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var query = _db.Set<TaxRate>().Where(t => t.CompanyId == companyId);
        if (!request.IncludeInactive)
            query = query.Where(t => t.IsActive);

        var rates = await query.OrderByDescending(t => t.Rate).ToListAsync(ct);
        return ApiResponse<List<TaxRateDto>>.Ok([.. rates.Select(t => t.ToDto())]);
    }
}
