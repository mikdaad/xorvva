using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Core.Interfaces;
using Xorva.Infrastructure.Data;
using Xorva.Modules.Approvals.DTOs;

namespace Xorva.Modules.Approvals.Queries.PendingApprovals;

public class PendingApprovalsQueryHandler
    : IRequestHandler<PendingApprovalsQuery, ApiResponse<List<ApprovalRequestDto>>>
{
    private readonly XorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public PendingApprovalsQueryHandler(XorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<ApprovalRequestDto>>> Handle(
        PendingApprovalsQuery request, CancellationToken cancellationToken)
    {
        // ApprovalRequest is CompanyEntity → filter already scopes to the caller's
        // company (CEO: all companies in tenant).
        var pending = await _db.ApprovalRequests
            .Include(r => r.Steps)
            .Where(r => r.Status == ApprovalStatus.Pending)
            .OrderBy(r => r.CreatedAt)
            .ToListAsync(cancellationToken);

        // Notify EXACTLY the role the current step is assigned to (strict routing) — not
        // "this role or higher" — so a CEO doesn't see manager-level steps, and each step
        // reaches only its own approver. Escalation already resolved the step's role to one
        // that has a user (at build time), so exact match is safe. Never your own request.
        var inbox = pending
            .Where(r => r.RequesterUserId != _tenant.UserId)
            .Select(r => new
            {
                Request = r,
                Current = r.Steps.Where(s => s.Status == ApprovalStepStatus.Pending)
                                 .OrderBy(s => s.Order).FirstOrDefault()
            })
            .Where(x => x.Current is not null && (int)_tenant.Role == (int)x.Current!.RequiredRole)
            .Select(x => x.Request.ToDto(canAct: true))
            .ToList();

        return ApiResponse<List<ApprovalRequestDto>>.Ok(inbox);
    }
}
