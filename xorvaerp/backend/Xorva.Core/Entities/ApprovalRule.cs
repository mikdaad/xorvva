using Xorva.Core.Enums;

namespace Xorva.Core.Entities;

/// <summary>
/// An admin-configured approval rule (the TEMPLATE). Company-scoped: one rule
/// belongs to exactly one company. CEO can create rules in any company and mark
/// them Mandatory; CompanyAdmin manages only their own and cannot set Mandatory.
///
/// Invariant (enforced in the handler): at most ONE active rule per
/// (CompanyId, ActionKey). Duplicate active rules are forbidden.
/// </summary>
public class ApprovalRule : CompanyEntity
{
    /// <summary>Admin-typed label, e.g. "Leave Approval".</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Business module label from the action registry (e.g. "Organization", "HR").</summary>
    public string Module { get; set; } = string.Empty;

    /// <summary>Stable action key this rule governs (e.g. "Tenants.CreateBranch").</summary>
    public string ActionKey { get; set; } = string.Empty;

    /// <summary>
    /// Ordered approver roles, 1 to 3 steps (e.g. [Manager, CompanyAdmin, SuperAdmin]).
    /// Stored as an integer array column.
    /// </summary>
    public List<SystemRole> ApproverRoles { get; set; } = [];

    /// <summary>Toggle on/off without deleting.</summary>
    public bool IsActive { get; set; } = true;

    /// <summary>
    /// CEO-only flag. When true, a CompanyAdmin sees the rule read-only and cannot
    /// disable, edit, or delete it.
    /// </summary>
    public bool IsMandatory { get; set; }

    /// <summary>
    /// Optional money gate. When set, the rule only intercepts an occurrence whose
    /// amount is at or above this value (in the company's base currency); smaller
    /// amounts run without approval. NULL (the default, and every legacy rule) means
    /// "always require approval" — the amount is never consulted.
    ///
    /// Only meaningful for actions that expose an amount (see IAmountApprovableAction);
    /// the rule builder offers this field for those actions only.
    /// </summary>
    public decimal? AmountThreshold { get; set; }
}
