using MediatR;
using Xorva.Core.Common;
using Xorva.Modules.Tenants.DTOs;

namespace Xorva.Modules.Tenants.Commands.RegisterTenant;

/// <summary>
/// PUBLIC SaaS signup: a corporation registers → the system atomically creates
/// the Tenant, its first Company, and the SuperAdmin (CEO) account.
/// This is the ONLY anonymous write endpoint in the platform.
/// </summary>
public record RegisterTenantCommand : IRequest<ApiResponse<TenantSignupResultDto>>
{
    public string TenantName { get; init; } = string.Empty;
    public string CompanyName { get; init; } = string.Empty;
    public string Email { get; init; } = string.Empty;
    public string Password { get; init; } = string.Empty;
    public string FirstName { get; init; } = string.Empty;
    public string LastName { get; init; } = string.Empty;
}
