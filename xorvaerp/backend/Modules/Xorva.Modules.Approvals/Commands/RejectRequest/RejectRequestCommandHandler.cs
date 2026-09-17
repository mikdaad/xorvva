using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Infrastructure.Data;
using Xorva.Modules.Approvals.DTOs;

namespace Xorva.Modules.Approvals.Commands.RejectRequest;

/// <summary>
/// Rejecting any step terminates the whole request — the captured action never runs.
/// </summary>
public class RejectRequestCommandHandler : IRequestHandler<RejectRequestCommand, ApiResponse<ApprovalRequestDto>>
{
    private readonly XorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public RejectRequestCommandHandler(XorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<ApprovalRequestDto>> Handle(
        RejectRequestCommand request, CancellationToken cancellationToken)
    {
        var approvalRequest = await _db.ApprovalRequests
            .Include(r => r.Steps)
            .FirstOrDefaultAsync(r => r.Id == request.RequestId, cancellationToken)
            ?? throw new NotFoundException("Approval request", request.RequestId);

        if (approvalRequest.Status != ApprovalStatus.Pending)
            throw new BadRequestException($"This request is already {approvalRequest.Status}.");

        var step = approvalRequest.Steps
            .Where(s => s.Status == ApprovalStepStatus.Pending)
            .OrderBy(s => s.Order)
            .FirstOrDefault()
            ?? throw new BadRequestException("This request has no step awaiting review.");

        if ((int)_tenant.Role > (int)step.RequiredRole)
            throw new ForbiddenException($"This step requires {step.RequiredRole} or higher.");
        if (_tenant.UserId == approvalRequest.RequesterUserId)
            throw new ForbiddenException("You cannot act on your own request.");

        step.Status = ApprovalStepStatus.Rejected;
        step.ActedByUserId = _tenant.UserId;
        step.ActedByEmail = _tenant.Email;
        step.Comment = request.Reason;
        step.ActedAt = DateTime.UtcNow;

        approvalRequest.Status = ApprovalStatus.Rejected;
        approvalRequest.Outcome = string.IsNullOrWhiteSpace(request.Reason)
            ? "Rejected."
            : $"Rejected: {request.Reason}";
        approvalRequest.CompletedAt = DateTime.UtcNow;
        approvalRequest.Version++;

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ConflictException("Another approver just acted on this request. Please refresh.");
        }

        return ApiResponse<ApprovalRequestDto>.Ok(approvalRequest.ToDto(), "Request rejected.");
    }
}
