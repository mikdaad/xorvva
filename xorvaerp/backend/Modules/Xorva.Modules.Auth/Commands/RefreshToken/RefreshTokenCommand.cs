using MediatR;
using Xorva.Core.Common;
using Xorva.Modules.Auth.DTOs;

namespace Xorva.Modules.Auth.Commands.RefreshToken;

public record RefreshTokenCommand : IRequest<ApiResponse<AuthResponseDto>>
{
    public string Token { get; init; } = string.Empty;
}
