using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Infrastructure.Data;
using Xorva.Modules.Approvals.DTOs;

namespace Xorva.Modules.Approvals.Queries.ApprovalHistory;

public class ApprovalHistoryQueryHandler
    : IRequestHandler<ApprovalHistoryQuery, ApiResponse<List<ApprovalRequestDto>>>
{
    private readonly XorvaDbContext _db;

    public ApprovalHistoryQueryHandler(XorvaDbContext db)
    {
        _db = db;
    }

    public async Task<ApiResponse<List<ApprovalRequestDto>>> Handle(
        ApprovalHistoryQuery request, CancellationToken cancellationToken)
    {
        var all = await _db.ApprovalRequests
            .Include(r => r.Steps)
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync(cancellationToken);

        return ApiResponse<List<ApprovalRequestDto>>.Ok(all.Select(r => r.ToDto()).ToList());
    }
}
