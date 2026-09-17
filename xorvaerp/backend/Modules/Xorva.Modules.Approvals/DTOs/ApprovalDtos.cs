using Xorva.Core.Entities;
using Xorva.Core.Enums;

namespace Xorva.Modules.Approvals.DTOs;

// ─── Registry (dynamic dropdowns) ───────────────────────────────

public record ModuleActionsDto
{
    public string Module { get; init; } = string.Empty;
    public List<ActionDto> Actions { get; init; } = [];
}

public record ActionDto
{
    public string ActionKey { get; init; } = string.Empty;
    public string DisplayName { get; init; } = string.Empty;
    /// <summary>True when a rule for this action may carry an amount threshold (money actions).</summary>
    public bool SupportsAmountThreshold { get; init; }
}

// ─── Rules ──────────────────────────────────────────────────────

public record ApprovalRuleDto
{
    public Guid Id { get; init; }
    public Guid CompanyId { get; init; }
    public string Name { get; init; } = string.Empty;
    public string Module { get; init; } = string.Empty;
    public string ActionKey { get; init; } = string.Empty;
    public List<SystemRole> ApproverRoles { get; init; } = [];
    public bool IsActive { get; init; }
    public bool IsMandatory { get; init; }
    /// <summary>Optional money gate: the rule only bites at or above this amount. Null = always.</summary>
    public decimal? AmountThreshold { get; init; }
    public DateTime CreatedAt { get; init; }
    /// <summary>True when the caller may not modify this rule (CEO-set Mandatory, viewed by CompanyAdmin).</summary>
    public bool ReadOnly { get; init; }
}

// ─── Requests / inbox / history ─────────────────────────────────

public record ApprovalStepDto
{
    public int Order { get; init; }
    public SystemRole RequiredRole { get; init; }
    public ApprovalStepStatus Status { get; init; }
    public string? ActedByEmail { get; init; }
    public string? Comment { get; init; }
    public DateTime? ActedAt { get; init; }
}

public record ApprovalRequestDto
{
    public Guid Id { get; init; }
    public Guid CompanyId { get; init; }
    public string ActionKey { get; init; } = string.Empty;
    public string Title { get; init; } = string.Empty;
    public ApprovalStatus Status { get; init; }
    public string RequesterEmail { get; init; } = string.Empty;
    public string RuleNameSnapshot { get; init; } = string.Empty;
    public string? Outcome { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime? CompletedAt { get; init; }
    public List<ApprovalStepDto> Steps { get; init; } = [];
    /// <summary>The order of the step currently awaiting action (null if terminal).</summary>
    public int? CurrentStepOrder { get; init; }
    /// <summary>True when the CURRENT caller is allowed to act on the current step.</summary>
    public bool CanAct { get; init; }
}

public static class ApprovalMappings
{
    public static ApprovalRuleDto ToDto(this ApprovalRule r, bool readOnly) => new()
    {
        Id = r.Id,
        CompanyId = r.CompanyId,
        Name = r.Name,
        Module = r.Module,
        ActionKey = r.ActionKey,
        ApproverRoles = r.ApproverRoles,
        IsActive = r.IsActive,
        IsMandatory = r.IsMandatory,
        AmountThreshold = r.AmountThreshold,
        CreatedAt = r.CreatedAt,
        ReadOnly = readOnly
    };

    public static ApprovalRequestDto ToDto(this ApprovalRequest r, bool canAct = false)
    {
        var current = r.Steps
            .Where(s => s.Status == ApprovalStepStatus.Pending)
            .OrderBy(s => s.Order)
            .FirstOrDefault();

        return new ApprovalRequestDto
        {
            Id = r.Id,
            CompanyId = r.CompanyId,
            ActionKey = r.ActionKey,
            Title = r.Title,
            Status = r.Status,
            RequesterEmail = r.RequesterEmail,
            RuleNameSnapshot = r.RuleNameSnapshot,
            Outcome = r.Outcome,
            CreatedAt = r.CreatedAt,
            CompletedAt = r.CompletedAt,
            CurrentStepOrder = current?.Order,
            CanAct = canAct,
            Steps = r.Steps
                .OrderBy(s => s.Order)
                .Select(s => new ApprovalStepDto
                {
                    Order = s.Order,
                    RequiredRole = s.RequiredRole,
                    Status = s.Status,
                    ActedByEmail = s.ActedByEmail,
                    Comment = s.Comment,
                    ActedAt = s.ActedAt
                })
                .ToList()
        };
    }
}
