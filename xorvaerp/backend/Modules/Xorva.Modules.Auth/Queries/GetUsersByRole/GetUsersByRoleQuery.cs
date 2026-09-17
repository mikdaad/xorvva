using MediatR;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Modules.Auth.DTOs;

namespace Xorva.Modules.Auth.Queries.GetUsersByRole;

/// <summary>
/// Paginated query to list users, optionally filtered by role.
/// Results are scoped by the caller's permission level.
/// </summary>
public record GetUsersByRoleQuery : IRequest<ApiResponse<PagedResult<UserDto>>>
{
    public SystemRole? Role { get; init; }
    public int Page { get; init; } = 1;
    public int PageSize { get; init; } = 20;
    public string? Search { get; init; }
}
