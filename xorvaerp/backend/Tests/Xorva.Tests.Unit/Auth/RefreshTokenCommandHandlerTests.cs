using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Entities;
using Xorva.Core.Exceptions;
using Xorva.Modules.Auth.Commands.RefreshToken;
using Xorva.Tests.Unit.TestHelpers;
using RefreshTokenEntity = Xorva.Core.Entities.RefreshToken;

namespace Xorva.Tests.Unit.Auth;

public class RefreshTokenCommandHandlerTests : AuthHandlerTestBase
{
    private RefreshTokenCommandHandler CreateHandler() => new(Db, JwtService, Config);

    private RefreshTokenEntity SeedToken(
        ApplicationUser user,
        string token,
        bool isRevoked = false,
        DateTime? expiresAt = null)
    {
        var refreshToken = new RefreshTokenEntity
        {
            Token = token,
            ExpiresAt = expiresAt ?? DateTime.UtcNow.AddDays(7),
            IsRevoked = isRevoked,
            UserId = user.Id
        };
        Db.RefreshTokens.Add(refreshToken);
        Db.SaveChanges();
        return refreshToken;
    }

    [Fact]
    public async Task RefreshToken_WithValidToken_RotatesTokens()
    {
        var user = SeedUser("refresh@acme.com");
        SeedToken(user, "valid-token-1");

        var result = await CreateHandler().Handle(
            new RefreshTokenCommand { Token = "valid-token-1" }, CancellationToken.None);

        result.Success.Should().BeTrue();
        result.Data!.AccessToken.Should().NotBeNullOrWhiteSpace();
        result.Data.RefreshToken.Should().NotBe("valid-token-1"); // rotated, never reused

        var oldToken = await Db.RefreshTokens.IgnoreQueryFilters()
            .SingleAsync(rt => rt.Token == "valid-token-1");
        oldToken.IsRevoked.Should().BeTrue();
        oldToken.ReplacedByToken.Should().Be(result.Data.RefreshToken);

        (await Db.RefreshTokens.IgnoreQueryFilters()
            .AnyAsync(rt => rt.Token == result.Data.RefreshToken && !rt.IsRevoked))
            .Should().BeTrue();
    }

    [Fact]
    public async Task RefreshToken_WithRevokedToken_ThrowsForbidden_AndRevokesAllSessions()
    {
        var user = SeedUser("victim@acme.com");
        SeedToken(user, "stolen-token", isRevoked: true);
        SeedToken(user, "other-active-session"); // a second, still-active session

        var act = () => CreateHandler().Handle(
            new RefreshTokenCommand { Token = "stolen-token" }, CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();

        // Reuse detection must kill EVERY session for this user
        var otherToken = await Db.RefreshTokens.IgnoreQueryFilters()
            .SingleAsync(rt => rt.Token == "other-active-session");
        otherToken.IsRevoked.Should().BeTrue();
    }

    [Fact]
    public async Task RefreshToken_WithExpiredToken_ThrowsUnauthorized()
    {
        var user = SeedUser("expired@acme.com");
        SeedToken(user, "expired-token", expiresAt: DateTime.UtcNow.AddMinutes(-1));

        var act = () => CreateHandler().Handle(
            new RefreshTokenCommand { Token = "expired-token" }, CancellationToken.None);

        await act.Should().ThrowAsync<UnauthorizedException>();
    }

    [Fact]
    public async Task RefreshToken_WithUnknownToken_ThrowsUnauthorized()
    {
        var act = () => CreateHandler().Handle(
            new RefreshTokenCommand { Token = "does-not-exist" }, CancellationToken.None);

        await act.Should().ThrowAsync<UnauthorizedException>();
    }
}
