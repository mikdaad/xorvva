namespace Xorva.Core.Approvals;

/// <summary>
/// Scoped flag that marks the current MediatR dispatch as an APPROVED REPLAY.
/// When set, ApprovalCheckBehavior passes the command straight through instead of
/// intercepting it again — which would otherwise create an infinite pending loop.
/// </summary>
public interface IApprovalExecutionContext
{
    /// <summary>True while a previously-approved command is being re-executed.</summary>
    bool IsReplaying { get; }

    /// <summary>Runs the given work with the replay flag set, then restores it.</summary>
    Task<T> RunAsReplayAsync<T>(Func<Task<T>> action);
}
