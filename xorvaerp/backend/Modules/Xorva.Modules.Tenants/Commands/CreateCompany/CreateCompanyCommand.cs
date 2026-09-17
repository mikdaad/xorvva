using MediatR;
using Xorva.Core.Common;
using Xorva.Modules.Tenants.DTOs;

namespace Xorva.Modules.Tenants.Commands.CreateCompany;

/// <summary>SuperAdmin (CEO) adds another legal entity to their tenant.</summary>
public record CreateCompanyCommand : IRequest<ApiResponse<CompanyDto>>
{
    public string Name { get; init; } = string.Empty;
    public string? Currency { get; init; }
    public string? Timezone { get; init; }
    public List<string>? ActiveModules { get; init; }
}
