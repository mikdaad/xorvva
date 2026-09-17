using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Common;
using Xorva.Modules.HR.Entities;

namespace Xorva.Modules.HR.Queries.GetEmployeeHistory;

/// <summary>One entry in an employee's change history (salary, status, position…).</summary>
public record EmployeeHistoryDto
{
    public Guid Id { get; init; }
    public string ChangeType { get; init; } = string.Empty;
    public string? OldValue { get; init; }
    public string? NewValue { get; init; }
    public string ChangedByEmail { get; init; } = string.Empty;
    public string? Reason { get; init; }
    public DateTime ChangedAt { get; init; }
}

public record GetEmployeeHistoryQuery(Guid EmployeeId) : IRequest<ApiResponse<List<EmployeeHistoryDto>>>;

public class GetEmployeeHistoryHandler : IRequestHandler<GetEmployeeHistoryQuery, ApiResponse<List<EmployeeHistoryDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public GetEmployeeHistoryHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<EmployeeHistoryDto>>> Handle(GetEmployeeHistoryQuery request, CancellationToken ct)
    {
        var employee = await _db.Set<Employee>().FirstOrDefaultAsync(e => e.Id == request.EmployeeId, ct)
            ?? throw new NotFoundException("Employee", request.EmployeeId);

        // Manager can only view their own department's employees.
        if (_tenant.Role == SystemRole.Manager)
        {
            var deptId = await HrGuard.GetCallerDepartmentIdAsync(_db, _tenant, ct);
            if (deptId is null || employee.DepartmentId != deptId.Value)
                throw new ForbiddenException("You can only view employees in your own department.");
        }

        var items = await _db.Set<EmployeeHistory>()
            .Where(h => h.EmployeeId == request.EmployeeId)
            .OrderByDescending(h => h.CreatedAt)
            .Select(h => new EmployeeHistoryDto
            {
                Id = h.Id,
                ChangeType = h.ChangeType,
                OldValue = h.OldValue,
                NewValue = h.NewValue,
                ChangedByEmail = h.ChangedByEmail,
                Reason = h.Reason,
                ChangedAt = h.CreatedAt,
            })
            .ToListAsync(ct);

        return ApiResponse<List<EmployeeHistoryDto>>.Ok(items);
    }
}
