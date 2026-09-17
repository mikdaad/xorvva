namespace Xorva.Modules.Auth.DTOs;

/// <summary>
/// Response returned after successful login or token refresh.
/// Contains both access and refresh tokens plus user context.
/// </summary>
public record AuthResponseDto
{
    public string AccessToken { get; init; } = string.Empty;
    public string RefreshToken { get; init; } = string.Empty;
    public DateTime ExpiresAt { get; init; }
    public UserDto User { get; init; } = null!;
}
