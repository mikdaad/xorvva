using Xorva.Core.Entities;

namespace Xorva.Modules.HR.Entities;

/// <summary>Leave category (Annual, Sick, …) with policy flags. Company-scoped.</summary>
public class LeaveType : CompanyEntity
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;

    /// <summary>Default annual allocation (0 = unlimited, e.g. unpaid).</summary>
    public decimal DefaultDays { get; set; }

    public bool IsPaid { get; set; } = true;
    public bool IsCarryForward { get; set; }
    public decimal MaxCarryForward { get; set; }
    public bool RequiresAttachment { get; set; }
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
    public string? Description { get; set; }
}
