using System.Reflection;
using System.Text.Json;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Approvals;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Core.Interfaces;
using Xorva.Infrastructure.Data;
// IApprovalPayloadProtector is in Xorva.Core.Interfaces (already imported above).

namespace Xorva.API.Behaviors;

/// <summary>
/// The Approval Engine's enforcement layer. Runs in the MediatR pipeline AFTER
/// ValidationBehavior — so only VALID commands are ever queued.
///
/// For a command implementing IApprovableAction it:
///   1. lets it through if this is an approved replay (no re-interception),
///   2. finds an active rule for (target company, action key); if none → executes normally,
///   3. builds the step chain applying escalation (missing role → next level up) and
///      auto-skip (requester's own rank already satisfies a step),
///   4. if every step auto-skips → executes normally (nothing to wait for),
///   5. otherwise serializes the command, stores a Pending ApprovalRequest, and
///      returns a "queued for approval" response (promoted to HTTP 202).
/// </summary>
public class ApprovalCheckBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    private readonly XorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IApprovalExecutionContext _execution;
    private readonly IApprovalPayloadProtector _protector;

    public ApprovalCheckBehavior(
        XorvaDbContext db,
        ICurrentTenantService tenant,
        IApprovalExecutionContext execution,
        IApprovalPayloadProtector protector)
    {
        _db = db;
        _tenant = tenant;
        _execution = execution;
        _protector = protector;
    }

    public async Task<TResponse> Handle(
        TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
    {
        // Only approvable commands, and never during an approved replay.
        if (request is not IApprovableAction action || _execution.IsReplaying)
            return await next(cancellationToken);

        var targetCompanyId = action.ApprovalCompanyId ?? _tenant.CompanyId;
        if (targetCompanyId == Guid.Empty)
            return await next(cancellationToken); // no company context → nothing to route

        // Active rule for this action in the target company?
        var rule = await _db.ApprovalRules
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(r =>
                r.CompanyId == targetCompanyId &&
                r.ActionKey == action.ApprovalActionKey &&
                r.IsActive, cancellationToken);

        if (rule is null || rule.ApproverRoles.Count == 0)
            return await next(cancellationToken); // no rule → execute normally

        // Amount gate: a rule may only bite at or above a value. When this action can
        // report its amount and it falls below the threshold, it runs without approval.
        // (A null threshold — the default and every legacy rule — never reaches here.)
        if (rule.AmountThreshold is { } threshold && request is IAmountApprovableAction amountAction)
        {
            var amount = await amountAction.ResolveApprovalAmountAsync(_db, cancellationToken);
            if (amount < threshold)
                return await next(cancellationToken); // below threshold → no approval needed
        }

        // Build the frozen step chain (escalation + auto-skip).
        var steps = await BuildStepsAsync(rule, targetCompanyId, cancellationToken);

        // If every step is auto-satisfied by the requester's rank, there's nothing
        // to wait for — execute the action now.
        if (steps.All(s => s.Status == ApprovalStepStatus.Skipped))
            return await next(cancellationToken);

        // Otherwise: capture, queue, and return a pending response.
        var approvalRequest = new ApprovalRequest
        {
            TenantId = _tenant.TenantId,
            CompanyId = targetCompanyId,
            ActionKey = action.ApprovalActionKey,
            Title = Truncate(action.ApprovalSummary, 300),
            Status = ApprovalStatus.Pending,
            // Encrypted at rest — the payload can hold a password or salary.
            CommandJson = _protector.Protect(JsonSerializer.Serialize(request, request.GetType())),
            RequesterUserId = _tenant.UserId,
            RequesterTenantId = _tenant.TenantId,
            RequesterCompanyId = _tenant.CompanyId,
            RequesterRole = _tenant.Role,
            RequesterEmail = _tenant.Email,
            RuleId = rule.Id,
            RuleNameSnapshot = rule.Name,
            Steps = steps
        };

        _db.ApprovalRequests.Add(approvalRequest);
        await _db.SaveChangesAsync(cancellationToken);

        return BuildPendingResponse(approvalRequest.Id,
            "Submitted for approval. It will be processed once approvers complete their review.");
    }

    /// <summary>
    /// Turns the rule's role chain into concrete steps: each role escalates to the
    /// next level up if no user holds it, and is marked Skipped if the requester's
    /// own rank already satisfies it.
    /// </summary>
    private async Task<List<ApprovalRequestStep>> BuildStepsAsync(
        ApprovalRule rule, Guid companyId, CancellationToken ct)
    {
        var steps = new List<ApprovalRequestStep>();
        var order = 1;

        foreach (var role in rule.ApproverRoles)
        {
            var effective = await EscalateAsync(role, companyId, ct);

            var satisfiedByRequester = (int)_tenant.Role <= (int)effective;

            steps.Add(new ApprovalRequestStep
            {
                TenantId = _tenant.TenantId,
                CompanyId = companyId,
                Order = order++,
                RequiredRole = effective,
                Status = satisfiedByRequester ? ApprovalStepStatus.Skipped : ApprovalStepStatus.Pending,
                ActedByUserId = satisfiedByRequester ? _tenant.UserId : null,
                ActedByEmail = satisfiedByRequester ? _tenant.Email : null,
                Comment = satisfiedByRequester ? "Auto-approved (requester's role satisfies this step)." : null,
                ActedAt = satisfiedByRequester ? DateTime.UtcNow : null
            });
        }

        return steps;
    }

    /// <summary>
    /// If no active user holds <paramref name="role"/> in the company, escalate to the
    /// next higher-privilege role that does (Manager → CompanyAdmin → SuperAdmin).
    /// SuperAdmin (tenant-wide) is the ceiling.
    /// </summary>
    private async Task<SystemRole> EscalateAsync(SystemRole role, Guid companyId, CancellationToken ct)
    {
        var current = role;
        while (current > SystemRole.SuperAdmin)
        {
            if (await RoleHasUserAsync(current, companyId, ct))
                return current;
            current = (SystemRole)((int)current - 1); // next level up
        }
        return SystemRole.SuperAdmin;
    }

    private Task<bool> RoleHasUserAsync(SystemRole role, Guid companyId, CancellationToken ct)
    {
        // SuperAdmin is tenant-wide (no company); other roles live inside the company.
        var query = _db.Users.IgnoreQueryFilters().Where(u => u.IsActive && u.Role == role);
        query = role == SystemRole.SuperAdmin
            ? query.Where(u => u.TenantId == _tenant.TenantId)
            : query.Where(u => u.TenantId == _tenant.TenantId && u.CompanyId == companyId);
        return query.AnyAsync(ct);
    }

    private static string Truncate(string value, int max) =>
        string.IsNullOrEmpty(value) ? value : value.Length <= max ? value : value[..max];

    /// <summary>
    /// Builds ApiResponse&lt;T&gt;.Pending(...) for the concrete TResponse via reflection.
    /// Approvable commands must return ApiResponse&lt;T&gt;.
    /// </summary>
    private static TResponse BuildPendingResponse(Guid approvalRequestId, string message)
    {
        var factory = typeof(TResponse).GetMethod("Pending", BindingFlags.Public | BindingFlags.Static);
        if (factory is null)
            throw new InvalidOperationException(
                $"Approvable command must return ApiResponse<T>, but {typeof(TResponse).Name} has no Pending factory.");

        return (TResponse)factory.Invoke(null, [approvalRequestId, message])!;
    }
}
