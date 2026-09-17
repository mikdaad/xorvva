using Xorva.Core.Entities;

namespace Xorva.Modules.HR.Entities;

/// <summary>
/// Append-only audit trail of significant employee changes (salary, position, status).
/// Enterprise HR compliance: "Ahmed's salary changed 15000 → 18000 on Jul 1 by Sara."
/// </summary>
public class EmployeeHistory : CompanyEntity
{
    public Guid EmployeeId { get; set; }

    /// <summary>"Salary", "Designation", "Department", "Status".</summary>
    public string ChangeType { get; set; } = string.Empty;

    public string? OldValue { get; set; }
    public string? NewValue { get; set; }

    public Guid ChangedByUserId { get; set; }
    public string ChangedByEmail { get; set; } = string.Empty;
    public string? Reason { get; set; }
}
