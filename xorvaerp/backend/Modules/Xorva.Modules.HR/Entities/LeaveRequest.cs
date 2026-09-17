using Xorva.Core.Entities;
using Xorva.Modules.HR.Enums;

namespace Xorva.Modules.HR.Entities;

/// <summary>
/// A leave application. When a leave approval rule exists, the application is routed
/// through the approval engine and this record is created (Approved) on final approval;
/// otherwise it is created directly. Cancelling an approved leave returns the days.
/// </summary>
public class LeaveRequest : CompanyEntity
{
    public Guid EmployeeId { get; set; }
    public Guid LeaveTypeId { get; set; }
    public DateOnly FromDate { get; set; }
    public DateOnly ToDate { get; set; }

    /// <summary>Working days (weekends + holidays excluded).</summary>
    public decimal TotalDays { get; set; }

    public string Reason { get; set; } = string.Empty;
    public LeaveStatus Status { get; set; } = LeaveStatus.Approved;
    public Guid? ApprovalRequestId { get; set; }
    public string? RejectionReason { get; set; }
    public string? AttachmentUrl { get; set; }
}
