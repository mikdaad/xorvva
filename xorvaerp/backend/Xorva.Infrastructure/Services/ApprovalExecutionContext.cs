using Xorva.Core.Approvals;

namespace Xorva.Infrastructure.Services;

/// <summary>
/// Scoped replay flag. Set only while an approved command is being re-executed,
/// so ApprovalCheckBehavior can tell a fresh submission from a replay and avoid
/// re-intercepting (which would loop forever).
/// </summary>
public class ApprovalExecutionContext : IApprovalExecutionContext
{
    public bool IsReplaying { get; private set; }

    public async Task<T> RunAsReplayAsync<T>(Func<Task<T>> action)
    {
        var previous = IsReplaying;
        IsReplaying = true;
        try
        {
            return await action();
        }
        finally
        {
            IsReplaying = previous;
        }
    }
}
