using MediatR;
using Xorva.Core.Common;
using Xorva.Modules.Auth.DTOs;

namespace Xorva.Modules.Auth.Commands.LoginUser;

public record LoginUserCommand : IRequest<ApiResponse<AuthResponseDto>>
{
    public string Email { get; init; } = string.Empty;
    public string Password { get; init; } = string.Empty;
}
