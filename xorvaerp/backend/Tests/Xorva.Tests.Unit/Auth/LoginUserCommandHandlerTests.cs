using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Modules.Auth.Commands.LoginUser;
using Xorva.Tests.Unit.TestHelpers;

namespace Xorva.Tests.Unit.Auth;

public class LoginUserCommandHandlerTests : AuthHandlerTestBase
{
    private LoginUserCommandHandler CreateHandler() => new(Db, Hasher, JwtService, Config);

    [Fact]
    public async Task LoginUser_WithValidCredentials_ReturnsTokens()
    {
        var user = SeedUser("login@acme.com", "Password@123", SystemRole.Manager, Guid.NewGuid(), Guid.NewGuid());

        var result = await CreateHandler().Handle(
            new LoginUserCommand { Email = "Login@Acme.com", Password = "Password@123" },
            CancellationToken.None);

        result.Success.Should().BeTrue();
        result.Data!.AccessToken.Should().NotBeNullOrWhiteSpace();
        result.Data.RefreshToken.Should().NotBeNullOrWhiteSpace();
        result.Data.ExpiresAt.Should().BeAfter(DateTime.UtcNow);
        result.Data.User.Email.Should().Be("login@acme.com");

        // Refresh token persisted + LastLoginAt audit updated
        (await Db.RefreshTokens.IgnoreQueryFilters()
            .AnyAsync(rt => rt.UserId == user.Id && rt.Token == result.Data.RefreshToken))
            .Should().BeTrue();
        (await Db.Users.IgnoreQueryFilters().SingleAsync(u => u.Id == user.Id))
            .LastLoginAt.Should().NotBeNull();
    }

    [Fact]
    public async Task LoginUser_WithWrongPassword_ThrowsUnauthorized()
    {
        SeedUser("login@acme.com", "Password@123");

        var act = () => CreateHandler().Handle(
            new LoginUserCommand { Email = "login@acme.com", Password = "WrongPassword@1" },
            CancellationToken.None);

        // Same generic message as unknown email — no information leakage
        (await act.Should().ThrowAsync<UnauthorizedException>())
            .WithMessage("Invalid credentials.");
    }

    [Fact]
    public async Task LoginUser_WithUnknownEmail_ThrowsUnauthorized()
    {
        var act = () => CreateHandler().Handle(
            new LoginUserCommand { Email = "ghost@acme.com", Password = "Password@123" },
            CancellationToken.None);

        (await act.Should().ThrowAsync<UnauthorizedException>())
            .WithMessage("Invalid credentials.");
    }

    [Fact]
    public async Task LoginUser_InactiveUser_ThrowsForbidden()
    {
        SeedUser("inactive@acme.com", "Password@123", isActive: false);

        var act = () => CreateHandler().Handle(
            new LoginUserCommand { Email = "inactive@acme.com", Password = "Password@123" },
            CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
    }
}
