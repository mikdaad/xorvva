using MediatR;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Modules.Approvals.DTOs;

namespace Xorva.Modules.Approvals.Commands.CreateRule;

/// <summary>
/// Creates an approval rule for one company. CEO can target any company and set
/// Mandatory; CompanyAdmin targets only their own and cannot set Mandatory.
/// </summary>
public record CreateRuleCommand : IRequest<ApiResponse<ApprovalRuleDto>>
{
    public Guid CompanyId { get; init; }
    public string Name { get; init; } = string.Empty;
    public string ActionKey { get; init; } = string.Empty;
    public List<SystemRole> ApproverRoles { get; init; } = [];
    public bool IsActive { get; init; } = true;
    public bool IsMandatory { get; init; }

    /// <summary>Optional money gate — only for actions that expose an amount. Null = always require approval.</summary>
    public decimal? AmountThreshold { get; init; }
}
