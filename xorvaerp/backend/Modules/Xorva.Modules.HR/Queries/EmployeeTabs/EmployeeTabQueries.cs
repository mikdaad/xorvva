using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.DTOs;
using Xorva.Modules.HR.Entities;

namespace Xorva.Modules.HR.Queries.EmployeeTabs;

// ═══════════════════════════════════════════════════════════════════════
//  LIST TABS  —  the employee-record sections designed for a company
// ═══════════════════════════════════════════════════════════════════════

public sealed record ListEmployeeTabsQuery : IRequest<ApiResponse<IReadOnlyList<EmployeeTabDto>>>
{
    public Guid? CompanyId { get; init; }
}

public sealed class ListEmployeeTabsHandler
    : IRequestHandler<ListEmployeeTabsQuery, ApiResponse<IReadOnlyList<EmployeeTabDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    public ListEmployeeTabsHandler(IXorvaDbContext db, ICurrentTenantService tenant) { _db = db; _tenant = tenant; }

    public async Task<ApiResponse<IReadOnlyList<EmployeeTabDto>>> Handle(
        ListEmployeeTabsQuery request, CancellationToken ct)
    {
        Guid? scope = _tenant.HasCrossCompanyAccess ? request.CompanyId : _tenant.CompanyId;

        var tabs = await _db.Set<EmployeeTab>()
            .Include(t => t.Fields)
            .Where(t => t.IsActive && (scope == null || t.CompanyId == scope))
            .OrderBy(t => t.SortOrder).ThenBy(t => t.Label)
            .ToListAsync(ct);

        IReadOnlyList<EmployeeTabDto> dtos = tabs.Select(EmployeeTabDto.From).ToList();
        return ApiResponse<IReadOnlyList<EmployeeTabDto>>.Ok(dtos);
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  LIST RECORDS  —  one employee's data under a tab (1 row for a form, many for a list)
// ═══════════════════════════════════════════════════════════════════════

public sealed record ListEmployeeTabRecordsQuery(Guid EmployeeId, Guid EmployeeTabId)
    : IRequest<ApiResponse<IReadOnlyList<EmployeeTabRecordDto>>>;

public sealed class ListEmployeeTabRecordsHandler
    : IRequestHandler<ListEmployeeTabRecordsQuery, ApiResponse<IReadOnlyList<EmployeeTabRecordDto>>>
{
    private readonly IXorvaDbContext _db;
    public ListEmployeeTabRecordsHandler(IXorvaDbContext db) => _db = db;

    public async Task<ApiResponse<IReadOnlyList<EmployeeTabRecordDto>>> Handle(
        ListEmployeeTabRecordsQuery request, CancellationToken ct)
    {
        var records = await _db.Set<EmployeeTabRecord>()
            .Where(r => r.EmployeeId == request.EmployeeId && r.EmployeeTabId == request.EmployeeTabId)
            .OrderBy(r => r.CreatedAt)
            .ToListAsync(ct);

        IReadOnlyList<EmployeeTabRecordDto> dtos = records.Select(EmployeeTabRecordDto.From).ToList();
        return ApiResponse<IReadOnlyList<EmployeeTabRecordDto>>.Ok(dtos);
    }
}
