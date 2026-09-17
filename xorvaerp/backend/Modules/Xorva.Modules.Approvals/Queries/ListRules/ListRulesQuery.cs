using MediatR;
using Xorva.Core.Common;
using Xorva.Modules.Approvals.DTOs;

namespace Xorva.Modules.Approvals.Queries.ListRules;

/// <summary>
/// Lists approval rules the caller can see. SuperAdmin: all companies in tenant
/// (optionally filtered by company). CompanyAdmin/Manager: own company only.
/// </summary>
public record ListRulesQuery : IRequest<ApiResponse<List<ApprovalRuleDto>>>
{
    public Guid? CompanyId { get; init; }
}
