using Xorva.Core.Enums;

namespace Xorva.Core.Entities;

/// <summary>
/// One frozen step in an approval request's chain. Company-scoped like its parent,
/// so the tenant/company query filter matches the ApprovalRequest exactly (a required
/// child of a filtered parent must share the filter, or EF warns of inconsistency).
/// </summary>
public class ApprovalRequestStep : CompanyEntity
{
    public Guid ApprovalRequestId { get; set; }
    public ApprovalRequest ApprovalRequest { get; set; } = null!;

    /// <summary>1-based position in the chain.</summary>
    public int Order { get; set; }

    /// <summary>
    /// The role required to approve this step, AFTER escalation was applied at
    /// submit time (e.g. Manager escalated to CompanyAdmin if no Manager existed).
    /// </summary>
    public SystemRole RequiredRole { get; set; }

    public ApprovalStepStatus Status { get; set; } = ApprovalStepStatus.Pending;

    public Guid? ActedByUserId { get; set; }
    public string? ActedByEmail { get; set; }
    public string? Comment { get; set; }
    public DateTime? ActedAt { get; set; }
}
