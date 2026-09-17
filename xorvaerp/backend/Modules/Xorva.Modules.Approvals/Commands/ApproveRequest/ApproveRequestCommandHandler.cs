using System.Text.Json;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xorva.Core.Approvals;
using Xorva.Core.Common;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Infrastructure.Data;
using Xorva.Modules.Approvals.DTOs;

namespace Xorva.Modules.Approvals.Commands.ApproveRequest;

/// <summary>
/// Approves the current step. When the last step is approved, the captured command
/// is REPLAYED under the requester's restored identity — in a fresh DI scope, so the
/// executed action commits independently of the approval record.
///
/// Ordering guarantees correctness under races: the step-approval is saved FIRST
/// (the xmin concurrency token rejects a second approver acting on the same version),
/// and only the winner proceeds to execute. The request stays Pending until execution
/// finishes, so a crash mid-execution surfaces as "all steps approved, not yet done"
/// rather than a silent success.
/// </summary>
public class ApproveRequestCommandHandler : IRequestHandler<ApproveRequestCommand, ApiResponse<ApprovalRequestDto>>
{
    private readonly XorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IServiceScopeFactory _scopeFactory;

    public ApproveRequestCommandHandler(
        XorvaDbContext db, ICurrentTenantService tenant, IServiceScopeFactory scopeFactory)
    {
        _db = db;
        _tenant = tenant;
        _scopeFactory = scopeFactory;
    }

    public async Task<ApiResponse<ApprovalRequestDto>> Handle(
        ApproveRequestCommand request, CancellationToken cancellationToken)
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
            ?? throw new BadRequestException("This request has no step awaiting approval.");

        // Approver must outrank-or-match the step, and can never approve their own request.
        if ((int)_tenant.Role > (int)step.RequiredRole)
            throw new ForbiddenException($"This step requires {step.RequiredRole} or higher.");
        if (_tenant.UserId == approvalRequest.RequesterUserId)
            throw new ForbiddenException("You cannot approve your own request.");

        step.Status = ApprovalStepStatus.Approved;
        step.ActedByUserId = _tenant.UserId;
        step.ActedByEmail = _tenant.Email;
        step.Comment = request.Comment;
        step.ActedAt = DateTime.UtcNow;

        // Force an update on the request row so the concurrency token is checked.
        approvalRequest.Version++;

        var isFinalStep = approvalRequest.Steps.All(s => s.Status != ApprovalStepStatus.Pending);

        // Save the step approval first — xmin guards against a concurrent second approver.
        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ConflictException("Another approver just acted on this request. Please refresh.");
        }

        if (!isFinalStep)
        {
            return ApiResponse<ApprovalRequestDto>.Ok(
                approvalRequest.ToDto(), "Step approved. Awaiting the next approver.");
        }

        // Final step approved → execute the captured action, then record the outcome.
        var (ok, error) = await ExecuteAsync(approvalRequest, cancellationToken);

        approvalRequest.Status = ok ? ApprovalStatus.Approved : ApprovalStatus.ApprovedButFailed;
        approvalRequest.Outcome = ok ? "Action executed successfully." : error;
        approvalRequest.CompletedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        return ApiResponse<ApprovalRequestDto>.Ok(
            approvalRequest.ToDto(),
            ok ? "Approved. The action has been executed."
               : "Approved, but the action failed to execute. See the request outcome.");
    }

    /// <summary>
    /// Replays the captured command in a FRESH scope under the requester's identity,
    /// with the replay flag set so the pipeline doesn't re-intercept it.
    /// </summary>
    private async Task<(bool ok, string? error)> ExecuteAsync(ApprovalRequest req, CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var sp = scope.ServiceProvider;

        var registry = sp.GetRequiredService<IApprovableActionRegistry>();
        var commandType = registry.ResolveCommandType(req.ActionKey);
        if (commandType is null)
            return (false, $"Action '{req.ActionKey}' is no longer available.");

        object? command;
        try
        {
            // Payload is encrypted at rest — decrypt before deserializing.
            var protector = sp.GetRequiredService<IApprovalPayloadProtector>();
            var json = protector.Unprotect(req.CommandJson);
            command = JsonSerializer.Deserialize(json, commandType);
        }
        catch (Exception ex)
        {
            return (false, $"Could not restore the original request: {ex.Message}");
        }
        if (command is null)
            return (false, "Could not restore the original request.");

        // Restore the REQUESTER's context (never the approver's) so tenant filters
        // and audit fields are correct.
        var tenant = sp.GetRequiredService<ICurrentTenantService>();
        tenant.SetTenant(req.RequesterUserId, req.RequesterTenantId, req.RequesterCompanyId,
            req.RequesterRole, req.RequesterEmail);

        var exec = sp.GetRequiredService<IApprovalExecutionContext>();
        var mediator = sp.GetRequiredService<IMediator>();

        try
        {
            await exec.RunAsReplayAsync(async () => await mediator.Send(command, ct));
            return (true, null);
        }
        catch (Exception ex)
        {
            // Validation may now fail, or the target may have been deleted meanwhile.
            return (false, ex.Message);
        }
    }
}
