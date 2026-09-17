using Xorva.Core.Entities;

namespace Xorva.Modules.HR.Entities;

/// <summary>
/// An employee's balance for one leave type in one year. Created lazily on first use.
/// RemainingDays is derived. A concurrency token guards against double-spend.
/// </summary>
public class LeaveAllocation : CompanyEntity
{
    public Guid EmployeeId { get; set; }
    public Guid LeaveTypeId { get; set; }
    public int Year { get; set; }
    public decimal TotalDays { get; set; }
    public decimal UsedDays { get; set; }
    public decimal RemainingDays => TotalDays - UsedDays;

    /// <summary>Optimistic concurrency token — bumped when days are consumed/released.</summary>
    public int Version { get; set; }
}
