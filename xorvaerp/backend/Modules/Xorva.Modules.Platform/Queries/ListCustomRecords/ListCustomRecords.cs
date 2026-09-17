using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Platform.DTOs;
using Xorva.Modules.Platform.Entities;

namespace Xorva.Modules.Platform.Queries.ListCustomRecords;

/// <summary>Lists the data rows of a custom sub-module (newest first), scoped by the tenant/company filter.</summary>
public sealed record ListCustomRecordsQuery(Guid EntityDefinitionId, Guid? CompanyId = null, Guid? ParentId = null)
    : IRequest<ApiResponse<IReadOnlyList<CustomRecordDto>>>;

public sealed class ListCustomRecordsHandler
    : IRequestHandler<ListCustomRecordsQuery, ApiResponse<IReadOnlyList<CustomRecordDto>>>
{
    private readonly IXorvaDbContext _db;

    public ListCustomRecordsHandler(IXorvaDbContext db) => _db = db;

    public async Task<ApiResponse<IReadOnlyList<CustomRecordDto>>> Handle(
        ListCustomRecordsQuery request, CancellationToken ct)
    {
        var q = _db.Set<CustomRecord>().Where(r => r.EntityDefinitionId == request.EntityDefinitionId);

        // A CEO viewing a specific company can narrow to it; otherwise the global filter applies.
        if (request.CompanyId is { } companyId) q = q.Where(r => r.CompanyId == companyId);
        // Attached tab: only this parent's records.
        if (request.ParentId is { } parentId) q = q.Where(r => r.ParentId == parentId);

        var records = await q.OrderByDescending(r => r.CreatedAt).ToListAsync(ct);
        return ApiResponse<IReadOnlyList<CustomRecordDto>>.Ok(records.Select(CustomRecordDto.From).ToList());
    }
}
