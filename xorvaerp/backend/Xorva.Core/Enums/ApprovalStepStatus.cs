namespace Xorva.Core.Enums;

/// <summary>
/// Status of a single step within an approval request's frozen chain.
/// </summary>
public enum ApprovalStepStatus
{
    /// <summary>Waiting for an approver of the required role to act.</summary>
    Pending = 0,

    /// <summary>An approver explicitly approved this step.</summary>
    Approved = 1,

    /// <summary>An approver rejected this step (ends the whole request).</summary>
    Rejected = 2,

    /// <summary>
    /// Auto-satisfied without a human click: the requester's own role already
    /// meets this step's requirement (self-approval auto-skip decision).
    /// </summary>
    Skipped = 3
}
