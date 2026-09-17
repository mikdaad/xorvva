using Xorva.Core.Enums;

namespace Xorva.Core.Entities;

/// <summary>
/// A live approval request (the INSTANCE) created when an approvable action is
/// intercepted. Company-scoped, so the tenant/company query filters confine who
/// can see it (CEO sees all companies; others only their own).
///
/// Carries everything needed to REPLAY the action later under the requester's
/// identity, plus a FROZEN copy of the steps so later rule edits can't mutate it.
/// </summary>
public class ApprovalRequest : CompanyEntity
{
    public string ActionKey { get; set; } = string.Empty;

    /// <summary>Human summary shown to approvers (from IApprovableAction.ApprovalSummary).</summary>
    public string Title { get; set; } = string.Empty;

    public ApprovalStatus Status { get; set; } = ApprovalStatus.Pending;

    /// <summary>The serialized command (System.Text.Json), replayed on final approval.</summary>
    public string CommandJson { get; set; } = string.Empty;

    // ─── Requester context (restored during replay — never the approver's) ──
    public Guid RequesterUserId { get; set; }
    public Guid RequesterTenantId { get; set; }
    public Guid RequesterCompanyId { get; set; }
    public SystemRole RequesterRole { get; set; }
    public string RequesterEmail { get; set; } = string.Empty;

    /// <summary>Reference to the originating rule (nullable — the snapshot is authoritative).</summary>
    public Guid? RuleId { get; set; }
    public string RuleNameSnapshot { get; set; } = string.Empty;

    /// <summary>Set when the request reaches a terminal state.</summary>
    public DateTime? CompletedAt { get; set; }

    /// <summary>Rejection reason or execution-failure detail.</summary>
    public string? Outcome { get; set; }

    /// <summary>Frozen step chain, ordered.</summary>
    public List<ApprovalRequestStep> Steps { get; set; } = [];

    /// <summary>
    /// Optimistic concurrency token, bumped on every approve/reject. Blocks the
    /// double-approve race: two approvers who both loaded the same version cannot
    /// both write — the second gets a concurrency conflict. Provider-agnostic
    /// (works on PostgreSQL and on the SQLite test database).
    /// </summary>
    public int Version { get; set; }
}
