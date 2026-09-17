namespace Xorva.Core.Approvals;

/// <summary>
/// Marker implemented by any command that MAY require approval.
/// The command is intercepted by ApprovalCheckBehavior only when BOTH are true:
///   1. it implements this interface, AND
///   2. an active approval rule exists for its ActionKey in the caller's company.
/// Otherwise it executes normally.
/// </summary>
public interface IApprovableAction
{
    /// <summary>
    /// Stable identifier for this action (e.g. "Tenants.CreateBranch").
    /// Stored in the DB and used to resolve the command type on replay — so it must
    /// NEVER change once shipped, even if the command CLASS is renamed later.
    /// </summary>
    string ApprovalActionKey { get; }

    /// <summary>
    /// Human-readable summary of this specific request, shown to approvers
    /// (e.g. "Create Branch: Dubai HQ"). Built from the command's own data.
    /// </summary>
    string ApprovalSummary { get; }

    /// <summary>
    /// The company whose approval rules govern THIS action — i.e. the company the
    /// action affects (a branch's company, a new user's company). Null means "use
    /// the caller's own company." This is what makes a SuperAdmin creating a branch
    /// in Company X get routed through Company X's rule, not the CEO's (empty) company.
    /// </summary>
    Guid? ApprovalCompanyId { get; }
}
