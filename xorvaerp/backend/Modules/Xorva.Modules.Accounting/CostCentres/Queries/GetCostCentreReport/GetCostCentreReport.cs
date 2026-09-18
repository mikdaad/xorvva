using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.CostCentres.Entities;
using Xorva.Modules.Accounting.DTOs;

namespace Xorva.Modules.Accounting.CostCentres.Queries.GetCostCentreReport;

/// <summary>Debit / credit / net per cost centre for a window (accounting.get_cost_centre_report), with budget variance.</summary>
public record GetCostCentreReportQuery : IRequest<ApiResponse<CostCentreReportDto>>
{
    public Guid? CompanyId { get; init; }
    public Guid? DimensionId { get; init; }
    public DateOnly? From { get; init; }
    public DateOnly? To { get; init; }
}

public class GetCostCentreReportHandler : IRequestHandler<GetCostCentreReportQuery, ApiResponse<CostCentreReportDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IAccountingRpc _rpc;

    public GetCostCentreReportHandler(IXorvaDbContext db, ICurrentTenantService tenant, IAccountingRpc rpc)
    {
        _db = db;
        _tenant = tenant;
        _rpc = rpc;
    }

    public async Task<ApiResponse<CostCentreReportDto>> Handle(GetCostCentreReportQuery request, CancellationToken ct)
    {
        var scope = AccountingGuard.ResolveReportScope(_tenant, request.CompanyId);
        var rows = await _rpc.GetCostCentreReportAsync(scope, request.DimensionId, request.From, request.To, ct);

        var ids = rows.Select(r => r.CostCentreId).ToList();
        var budgets = await _db.Set<CostCentre>().AsNoTracking()
            .Where(c => ids.Contains(c.Id) && c.Budget != null)
            .ToDictionaryAsync(c => c.Id, c => c.Budget, ct);

        var dto = new CostCentreReportDto
        {
            From = request.From, To = request.To, DimensionId = request.DimensionId,
            Rows = [.. rows.Select(r => r.ToDto(budgets.GetValueOrDefault(r.CostCentreId)))],
            TotalDebit = rows.Where(r => !r.IsGroup).Sum(r => r.Debit),
            TotalCredit = rows.Where(r => !r.IsGroup).Sum(r => r.Credit),
            TotalNet = rows.Where(r => !r.IsGroup).Sum(r => r.Net),
        };
        return ApiResponse<CostCentreReportDto>.Ok(dto);
    }
}
