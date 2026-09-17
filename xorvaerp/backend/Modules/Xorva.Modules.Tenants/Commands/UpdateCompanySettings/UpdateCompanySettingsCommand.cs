using MediatR;
using Xorva.Core.Common;
using Xorva.Modules.Tenants.DTOs;

namespace Xorva.Modules.Tenants.Commands.UpdateCompanySettings;

/// <summary>
/// Update company profile: name, currency, timezone.
/// SuperAdmin: any company in tenant. CompanyAdmin: own company only.
/// </summary>
public record UpdateCompanySettingsCommand : IRequest<ApiResponse<CompanyDto>>
{
    public Guid CompanyId { get; init; }
    public string Name { get; init; } = string.Empty;
    public string Currency { get; init; } = string.Empty;
    public string Timezone { get; init; } = string.Empty;
}
