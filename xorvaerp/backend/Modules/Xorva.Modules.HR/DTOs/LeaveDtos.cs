using Xorva.Modules.HR.Entities;
using Xorva.Modules.HR.Enums;

namespace Xorva.Modules.HR.DTOs;

public record HolidayDto
{
    public Guid Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public DateOnly Date { get; init; }
}

public record LeaveTypeDto
{
    public Guid Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string Code { get; init; } = string.Empty;
    public decimal DefaultDays { get; init; }
    public bool IsPaid { get; init; }
    public bool IsCarryForward { get; init; }
    public decimal MaxCarryForward { get; init; }
    public bool RequiresAttachment { get; init; }
    public bool IsActive { get; init; }
    public string? Description { get; init; }
}

public record LeaveRequestDto
{
    public Guid Id { get; init; }
    public Guid EmployeeId { get; init; }
    public string? EmployeeName { get; init; }
    public Guid LeaveTypeId { get; init; }
    public string? LeaveTypeName { get; init; }
    public DateOnly FromDate { get; init; }
    public DateOnly ToDate { get; init; }
    public decimal TotalDays { get; init; }
    public string Reason { get; init; } = string.Empty;
    public LeaveStatus Status { get; init; }
    public string? RejectionReason { get; init; }
    public DateTime CreatedAt { get; init; }
}

public record LeaveBalanceDto
{
    public Guid LeaveTypeId { get; init; }
    public string LeaveTypeName { get; init; } = string.Empty;
    public string LeaveTypeCode { get; init; } = string.Empty;
    public int Year { get; init; }
    public decimal TotalDays { get; init; }
    public decimal UsedDays { get; init; }
    public decimal RemainingDays { get; init; }
    public bool IsPaid { get; init; }
}

public static class LeaveMappings
{
    public static HolidayDto ToDto(this Holiday h) => new()
    {
        Id = h.Id, Name = h.Name, Date = h.Date
    };

    public static LeaveTypeDto ToDto(this LeaveType t) => new()
    {
        Id = t.Id, Name = t.Name, Code = t.Code, DefaultDays = t.DefaultDays,
        IsPaid = t.IsPaid, IsCarryForward = t.IsCarryForward, MaxCarryForward = t.MaxCarryForward,
        RequiresAttachment = t.RequiresAttachment, IsActive = t.IsActive, Description = t.Description
    };
}
