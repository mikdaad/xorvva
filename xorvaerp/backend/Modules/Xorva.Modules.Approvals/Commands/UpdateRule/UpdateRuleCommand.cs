using MediatR;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Modules.Approvals.DTOs;

namespace Xorva.Modules.Approvals.Commands.UpdateRule;

/// <summary>
/// Edits a rule's name, approver chain, and active state. The action it governs is
/// fixed at creation. CompanyAdmin cannot touch a CEO Mandatory rule or set Mandatory.
/// </summary>
public record UpdateRuleCommand : IRequest<ApiResponse<ApprovalRuleDto>>
{
    public Guid RuleId { get; init; }
    public string Name { get; init; } = string.Empty;
    public List<SystemRole> ApproverRoles { get; init; } = [];
    public bool IsActive { get; init; }
    public bool IsMandatory { get; init; }

    /// <summary>Optional money gate — only for actions that expose an amount. Null = always require approval.</summary>
    public decimal? AmountThreshold { get; init; }
}
