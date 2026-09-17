namespace Xorva.Core.Entities;

/// <summary>
/// Append-only log of rule changes (who created/edited/deleted a rule, when).
/// Company-scoped so it inherits tenant isolation automatically.
/// </summary>
public class ApprovalRuleAudit : CompanyEntity
{
    public Guid RuleId { get; set; }
    public string RuleName { get; set; } = string.Empty;

    /// <summary>"Created", "Updated", "Deleted", "Activated", "Deactivated".</summary>
    public string ChangeType { get; set; } = string.Empty;

    public Guid ChangedByUserId { get; set; }
    public string ChangedByEmail { get; set; } = string.Empty;

    /// <summary>Short human description of what changed.</summary>
    public string Detail { get; set; } = string.Empty;
}
