using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Common;
using Xorva.Modules.HR.DTOs;
using Xorva.Modules.HR.Entities;

namespace Xorva.Modules.HR.Queries.ListPayRuns;

public record ListPayRunsQuery : IRequest<ApiResponse<List<PayRunSummaryDto>>>
{
    public Guid? CompanyId { get; init; }
}

public class ListPayRunsHandler : IRequestHandler<ListPayRunsQuery, ApiResponse<List<PayRunSummaryDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public ListPayRunsHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<PayRunSummaryDto>>> Handle(ListPayRunsQuery request, CancellationToken ct)
    {
        var companyId = HrGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var runs = await _db.Set<PayRun>()
            .Where(p => p.CompanyId == companyId)
            .Select(p => new { Run = p, Count = p.Payslips.Count })
            .OrderByDescending(x => x.Run.Year).ThenByDescending(x => x.Run.Month)
            .ToListAsync(ct);

        return ApiResponse<List<PayRunSummaryDto>>.Ok([.. runs.Select(x => x.Run.ToSummaryDto(x.Count))]);
    }
}
