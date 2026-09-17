using MediatR;
using Xorva.Core.Common;
using Xorva.Modules.Tenants.DTOs;

namespace Xorva.Modules.Tenants.Queries.GetCurrentTenant;

/// <summary>Returns the caller's tenant details. The tenant query filter guarantees own-tenant only.</summary>
public record GetCurrentTenantQuery : IRequest<ApiResponse<TenantDto>>;
