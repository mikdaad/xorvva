using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Common;
using Xorva.Modules.HR.DTOs;
using Xorva.Modules.HR.Entities;

namespace Xorva.Modules.HR.Commands.SeedLeaveTypes;

/// <summary>Creates the standard leave types for a company if none exist yet.</summary>
public record SeedLeaveTypesCommand : IRequest<ApiResponse<List<LeaveTypeDto>>>
{
    public Guid? CompanyId { get; init; }
}

public class SeedLeaveTypesCommandHandler : IRequestHandler<SeedLeaveTypesCommand, ApiResponse<List<LeaveTypeDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public SeedLeaveTypesCommandHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    private static readonly (string Name, string Code, decimal Days, bool Paid, bool Carry, decimal MaxCarry)[] Defaults =
    [
        ("Annual Leave", "AL", 30, true, true, 10),
        ("Sick Leave", "SL", 15, true, false, 0),
        ("Unpaid Leave", "UL", 0, false, false, 0),
        ("Maternity Leave", "ML", 90, true, false, 0),
        ("Emergency Leave", "EL", 5, true, false, 0),
    ];

    public async Task<ApiResponse<List<LeaveTypeDto>>> Handle(SeedLeaveTypesCommand request, CancellationToken ct)
    {
        var companyId = HrGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await HrGuard.EnsureHrActiveAsync(_db, companyId, ct);

        var existing = await _db.Set<LeaveType>().Where(t => t.CompanyId == companyId)
            .Select(t => t.Code).ToListAsync(ct);
        var existingSet = existing.ToHashSet();

        var created = new List<LeaveType>();
        var order = 0;
        foreach (var d in Defaults)
        {
            order++;
            if (existingSet.Contains(d.Code)) continue;
            var type = new LeaveType
            {
                TenantId = _tenant.TenantId,
                CompanyId = companyId,
                Name = d.Name,
                Code = d.Code,
                DefaultDays = d.Days,
                IsPaid = d.Paid,
                IsCarryForward = d.Carry,
                MaxCarryForward = d.MaxCarry,
                SortOrder = order
            };
            _db.Set<LeaveType>().Add(type);
            created.Add(type);
        }

        await _db.SaveChangesAsync(ct);
        return ApiResponse<List<LeaveTypeDto>>.Ok(
            created.Select(t => t.ToDto()).ToList(),
            created.Count > 0 ? $"Seeded {created.Count} leave type(s)." : "Leave types already exist.");
    }
}
