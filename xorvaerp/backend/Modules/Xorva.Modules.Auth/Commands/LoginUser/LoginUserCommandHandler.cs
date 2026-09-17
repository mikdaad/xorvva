using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Infrastructure.Data;
using Xorva.Infrastructure.Services;
using Xorva.Modules.Auth.DTOs;
using Xorva.Core.Entities;

namespace Xorva.Modules.Auth.Commands.LoginUser;

/// <summary>
/// Handles user authentication. Returns JWT access token + refresh token.
/// 
/// Security decisions:
/// - Generic "Invalid credentials" error prevents email enumeration
/// - BCrypt.Verify is constant-time to prevent timing attacks
/// - Refresh token stored in DB with expiry and rotation support
/// - LastLoginAt updated for audit trail
/// </summary>
public class LoginUserCommandHandler : IRequestHandler<LoginUserCommand, ApiResponse<AuthResponseDto>>
{
    private readonly XorvaDbContext _db;
    private readonly PasswordHasher _passwordHasher;
    private readonly JwtTokenService _jwtService;
    private readonly IConfiguration _configuration;

    public LoginUserCommandHandler(
        XorvaDbContext db,
        PasswordHasher passwordHasher,
        JwtTokenService jwtService,
        IConfiguration configuration)
    {
        _db = db;
        _passwordHasher = passwordHasher;
        _jwtService = jwtService;
        _configuration = configuration;
    }

    public async Task<ApiResponse<AuthResponseDto>> Handle(LoginUserCommand request, CancellationToken cancellationToken)
    {
        // ─── Find user (bypass tenant filter — login is pre-context) ─
        var user = await _db.Users
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Email == request.Email.ToLower().Trim(), cancellationToken);

        // Generic error: never reveal if email exists or password is wrong
        if (user is null)
            throw new UnauthorizedException("Invalid credentials.");

        if (!_passwordHasher.Verify(request.Password, user.PasswordHash))
            throw new UnauthorizedException("Invalid credentials.");

        if (!user.IsActive)
            throw new ForbiddenException("Your account has been deactivated. Contact your administrator.");

        // ─── Generate tokens ────────────────────────────────────
        var (accessToken, expiresAt) = _jwtService.GenerateAccessToken(
            user.Id, user.Email, user.FirstName, user.LastName,
            user.Role, user.TenantId, user.CompanyId);

        var refreshTokenString = _jwtService.GenerateRefreshToken();

        var refreshTokenExpirationDays = int.Parse(
            _configuration["JwtSettings:RefreshTokenExpirationDays"] ?? "7");

        var refreshToken = new Xorva.Core.Entities.RefreshToken
        {
            Token = refreshTokenString,
            ExpiresAt = DateTime.UtcNow.AddDays(refreshTokenExpirationDays),
            UserId = user.Id
        };

        _db.RefreshTokens.Add(refreshToken);

        // ─── Update last login ──────────────────────────────────
        user.LastLoginAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        return ApiResponse<AuthResponseDto>.Ok(new AuthResponseDto
        {
            AccessToken = accessToken,
            RefreshToken = refreshTokenString,
            ExpiresAt = expiresAt,
            User = user.ToDto()
        });
    }
}
