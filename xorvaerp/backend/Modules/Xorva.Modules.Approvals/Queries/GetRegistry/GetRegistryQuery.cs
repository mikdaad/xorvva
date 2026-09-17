using MediatR;
using Xorva.Core.Common;
using Xorva.Modules.Approvals.DTOs;

namespace Xorva.Modules.Approvals.Queries.GetRegistry;

/// <summary>
/// Returns the modules and actions available to build rules for a given company:
/// all foundation actions, plus business-module actions for modules that company
/// has activated. Powers the rule-builder's dynamic Module/Action dropdowns.
/// </summary>
public record GetRegistryQuery : IRequest<ApiResponse<List<ModuleActionsDto>>>
{
    public Guid CompanyId { get; init; }
}
