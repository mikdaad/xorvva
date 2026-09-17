using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using Xorva.Core.Enums;

namespace Xorva.Infrastructure.Services;

/// <summary>
/// JWT token generation and validation service.
/// Access tokens: 15 min, contain user identity + tenant context + role.
/// Refresh tokens: 7 days, opaque random strings stored in database.
/// 
/// Token design decisions:
/// - Short-lived access tokens reduce compromise window
/// - Refresh tokens enable silent renewal without re-authentication
/// - All tenant/role context embedded in JWT claims — zero DB lookups for RBAC
/// </summary>
public class JwtTokenService
{
    private readonly IConfiguration _configuration;
    private readonly SymmetricSecurityKey _signingKey;

    public JwtTokenService(IConfiguration configuration)
    {
        _configuration = configuration;
        var secretKey = _configuration["JwtSettings:SecretKey"];
        if (string.IsNullOrWhiteSpace(secretKey) || secretKey.Length < 64)
            throw new InvalidOperationException(
                "JwtSettings:SecretKey is not configured (min 64 chars). " +
                "Development: 'dotnet user-secrets set \"JwtSettings:SecretKey\" \"<key>\"' on Xorva.API.");
        _signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secretKey));
    }

    /// <summary>
    /// Generates a JWT access token containing the user's identity, role, and tenant context.
    /// These claims are read by TenantResolverMiddleware and RequireRoleAttribute on every request.
    /// </summary>
    public (string Token, DateTime ExpiresAt) GenerateAccessToken(
        Guid userId,
        string email,
        string firstName,
        string lastName,
        SystemRole role,
        Guid? tenantId,
        Guid? companyId)
    {
        var expirationMinutes = int.Parse(_configuration["JwtSettings:AccessTokenExpirationMinutes"] ?? "15");
        var expiresAt = DateTime.UtcNow.AddMinutes(expirationMinutes);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, userId.ToString()),
            new(JwtRegisteredClaimNames.Email, email),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new("firstName", firstName),
            new("lastName", lastName),
            new(ClaimTypes.Role, role.ToString()),
            new("role_value", ((int)role).ToString())
        };

        // SystemAdmin operates above tenants — no tenant context in token
        if (tenantId.HasValue)
            claims.Add(new Claim("tenantId", tenantId.Value.ToString()));

        if (companyId.HasValue)
            claims.Add(new Claim("companyId", companyId.Value.ToString()));

        var credentials = new SigningCredentials(_signingKey, SecurityAlgorithms.HmacSha256);
        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = expiresAt,
            SigningCredentials = credentials,
            Issuer = _configuration["JwtSettings:Issuer"],
            Audience = _configuration["JwtSettings:Audience"]
        };

        var tokenHandler = new JwtSecurityTokenHandler();
        var token = tokenHandler.CreateToken(tokenDescriptor);

        return (tokenHandler.WriteToken(token), expiresAt);
    }

    /// <summary>
    /// Generates a cryptographically secure random refresh token.
    /// Stored in the database, not self-contained like JWT.
    /// </summary>
    public string GenerateRefreshToken()
    {
        var randomBytes = new byte[64];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(randomBytes);
        return Convert.ToBase64String(randomBytes);
    }

    /// <summary>
    /// Returns the token validation parameters used by the JWT middleware.
    /// </summary>
    public TokenValidationParameters GetTokenValidationParameters()
    {
        return new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = _signingKey,
            ValidateIssuer = true,
            ValidIssuer = _configuration["JwtSettings:Issuer"],
            ValidateAudience = true,
            ValidAudience = _configuration["JwtSettings:Audience"],
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30) // Tight clock skew — 30 sec tolerance
        };
    }
}
