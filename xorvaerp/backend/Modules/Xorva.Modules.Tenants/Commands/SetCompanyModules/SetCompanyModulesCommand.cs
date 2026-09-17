using MediatR;
using Xorva.Core.Common;
using Xorva.Modules.Tenants.DTOs;

namespace Xorva.Modules.Tenants.Commands.SetCompanyModules;

/// <summary>
/// Module activation is a subscription-level decision — SuperAdmin (CEO) only.
/// Replaces the company's active module set with the given keys.
/// </summary>
public record SetCompanyModulesCommand : IRequest<ApiResponse<CompanyDto>>
{
    public Guid CompanyId { get; init; }
    public List<string> Modules { get; init; } = [];
}
