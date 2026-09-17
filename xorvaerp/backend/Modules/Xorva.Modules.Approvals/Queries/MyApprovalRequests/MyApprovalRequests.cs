using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Infrastructure.Data;
using Xorva.Modules.Approvals.DTOs;

namespace Xorva.Modules.Approvals.Queries.MyApprovalRequests;

/// <summary>
/// Approval requests the CURRENT user submitted — their own in-flight and finished
/// requests. Unlike the approver inbox, this is available to everyone (an Employee can
/// see the status of the leave they requested while it's still Pending). Optionally
/// filtered by action key (e.g. "HR.LeaveRequest").
/// </summary>
public record MyApprovalRequestsQuery : IRequest<ApiResponse<List<ApprovalRequestDto>>>
{
    public string? ActionKey { get; init; }
}

public class MyApprovalRequestsQueryHandler
    : IRequestHandler<MyApprovalRequestsQuery, ApiResponse<List<ApprovalRequestDto>>>
{
    private readonly XorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public MyApprovalRequestsQueryHandler(XorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<ApprovalRequestDto>>> Handle(
        MyApprovalRequestsQuery request, CancellationToken cancellationToken)
    {
        var query = _db.ApprovalRequests
            .Include(r => r.Steps)
            .Where(r => r.RequesterUserId == _tenant.UserId);

        if (!string.IsNullOrWhiteSpace(request.ActionKey))
            query = query.Where(r => r.ActionKey == request.ActionKey);

        var mine = await query
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync(cancellationToken);

        return ApiResponse<List<ApprovalRequestDto>>.Ok(mine.Select(r => r.ToDto()).ToList());
    }
}
