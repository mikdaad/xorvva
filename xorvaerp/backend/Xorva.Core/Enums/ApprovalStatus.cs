namespace Xorva.Core.Enums;

/// <summary>
/// Lifecycle state of an approval request.
/// State machine: PENDING → REJECTED | CANCELLED | APPROVED | APPROVED_BUT_FAILED
/// </summary>
public enum ApprovalStatus
{
    /// <summary>Awaiting review by the current approver step.</summary>
    Pending = 0,

    /// <summary>All required steps approved AND the deferred action executed successfully.</summary>
    Approved = 1,

    /// <summary>Rejected by an approver step. The whole request is terminal.</summary>
    Rejected = 2,

    /// <summary>Withdrawn by the requester before completion.</summary>
    Cancelled = 3,

    /// <summary>
    /// All steps approved, but replaying the deferred action FAILED (e.g. validation
    /// no longer passes, or the target was deleted meanwhile). Terminal and visible —
    /// this state exists specifically to prevent silent data loss.
    /// </summary>
    ApprovedButFailed = 4
}
