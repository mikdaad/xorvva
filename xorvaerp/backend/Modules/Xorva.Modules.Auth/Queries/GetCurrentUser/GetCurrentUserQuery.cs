using MediatR;
using Xorva.Core.Common;
using Xorva.Modules.Auth.DTOs;

namespace Xorva.Modules.Auth.Queries.GetCurrentUser;

/// <summary>
/// Query to get the currently authenticated user's profile.
/// No parameters needed — identity comes from JWT claims via ICurrentTenantService.
/// </summary>
public record GetCurrentUserQuery : IRequest<ApiResponse<UserDto>>;
