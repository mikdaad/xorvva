using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Ledger.Queries.ListFiscalYears;

public record ListFiscalYearsQuery : IRequest<ApiResponse<List<FiscalYearDto>>>
{
    public Guid? CompanyId { get; init; }
}

public class ListFiscalYearsHandler : IRequestHandler<ListFiscalYearsQuery, ApiResponse<List<FiscalYearDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public ListFiscalYearsHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<FiscalYearDto>>> Handle(ListFiscalYearsQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var years = await _db.Set<FiscalYear>()
            .Where(y => y.CompanyId == companyId)
            .OrderByDescending(y => y.StartDate)
            .ToListAsync(ct);

        var periods = await _db.Set<FiscalPeriod>()
            .Where(p => p.CompanyId == companyId)
            .ToListAsync(ct);

        var byYear = periods.GroupBy(p => p.FiscalYearId).ToDictionary(g => g.Key, g => g.ToList());

        return ApiResponse<List<FiscalYearDto>>.Ok(
            [.. years.Select(y => y.ToDto(byYear.GetValueOrDefault(y.Id, [])))]);
    }
}
