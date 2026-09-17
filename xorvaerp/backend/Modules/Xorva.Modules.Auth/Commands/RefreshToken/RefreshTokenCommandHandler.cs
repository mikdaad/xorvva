using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Infrastructure.Data;
using Xorva.Infrastructure.Services;
using Xorva.Modules.Auth.DTOs;

namespace Xorva.Modules.Auth.Commands.RefreshToken;

/// <summary>
/// Handles refresh token rotation.
/// 
/// Security: Token rotation prevents replay attacks.
/// - Each refresh token can be used exactly ONCE
/// - Using a revoked token invalidates the entire chain (potential compromise)
/// - Old token is revoked and replaced by a new one
/// </summary>
public class RefreshTokenCommandHandler : IRequestHandler<RefreshTokenCommand, ApiResponse<AuthResponseDto>>
{
    private readonly XorvaDbContext _db;
    private readonly JwtTokenService _jwtService;
    private readonly IConfiguration _configuration;

    public RefreshTokenCommandHandler(
        XorvaDbContext db,
        JwtTokenService jwtService,
        IConfiguration configuration)
    {
        _db = db;
        _jwtService = jwtService;
        _configuration = configuration;
    }

    public async Task<ApiResponse<AuthResponseDto>> Handle(RefreshTokenCommand request, CancellationToken cancellationToken)
    {
        // ─── Find the refresh token with its user ───────────────
        var existingToken = await _db.RefreshTokens
            .IgnoreQueryFilters()
            .Include(rt => rt.User)
            .FirstOrDefaultAsync(rt => rt.Token == request.Token, cancellationToken);

        if (existingToken is null)
            throw new UnauthorizedException("Invalid refresh token.");

        // ─── Validate token state ───────────────────────────────
        if (existingToken.IsRevoked)
        {
            // Someone tried to reuse a revoked token — potential compromise
            // Revoke ALL tokens for this user as a safety measure
            var allUserTokens = await _db.RefreshTokens
                .IgnoreQueryFilters()
                .Where(rt => rt.UserId == existingToken.UserId && !rt.IsRevoked)
                .ToListAsync(cancellationToken);

            foreach (var token in allUserTokens)
            {
                token.IsRevoked = true;
                token.RevokedAt = DateTime.UtcNow;
            }
            await _db.SaveChangesAsync(cancellationToken);

            throw new ForbiddenException("Token reuse detected. All sessions have been invalidated for security.");
        }

        if (DateTime.UtcNow >= existingToken.ExpiresAt)
            throw new UnauthorizedException("Refresh token has expired. Please login again.");

        if (!existingToken.User.IsActive)
            throw new ForbiddenException("Your account has been deactivated.");

        // ─── Rotate: revoke old, create new ─────────────────────
        existingToken.IsRevoked = true;
        existingToken.RevokedAt = DateTime.UtcNow;

        var newRefreshTokenString = _jwtService.GenerateRefreshToken();
        existingToken.ReplacedByToken = newRefreshTokenString;

        var refreshTokenExpirationDays = int.Parse(
            _configuration["JwtSettings:RefreshTokenExpirationDays"] ?? "7");

        var newRefreshToken = new Xorva.Core.Entities.RefreshToken
        {
            Token = newRefreshTokenString,
            ExpiresAt = DateTime.UtcNow.AddDays(refreshTokenExpirationDays),
            UserId = existingToken.UserId
        };

        _db.RefreshTokens.Add(newRefreshToken);

        // ─── Generate new access token ──────────────────────────
        var user = existingToken.User;
        var (accessToken, expiresAt) = _jwtService.GenerateAccessToken(
            user.Id, user.Email, user.FirstName, user.LastName,
            user.Role, user.TenantId, user.CompanyId);

        await _db.SaveChangesAsync(cancellationToken);

        return ApiResponse<AuthResponseDto>.Ok(new AuthResponseDto
        {
            AccessToken = accessToken,
            RefreshToken = newRefreshTokenString,
            ExpiresAt = expiresAt,
            User = user.ToDto()
        });
    }
}
