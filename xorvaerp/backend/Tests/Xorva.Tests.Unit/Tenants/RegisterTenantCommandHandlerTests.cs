using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Constants;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Modules.Tenants.Commands.RegisterTenant;
using Xorva.Tests.Unit.TestHelpers;

namespace Xorva.Tests.Unit.Tenants;

public class RegisterTenantCommandHandlerTests : AuthHandlerTestBase
{
    private RegisterTenantCommandHandler CreateHandler() => new(Db, Hasher);

    private static RegisterTenantCommand ValidCommand(string email = "ceo@acme.test") => new()
    {
        TenantName = "Acme Group",
        CompanyName = "Acme Trading",
        Email = email,
        Password = "Password@123",
        FirstName = "Alice",
        LastName = "Ceo"
    };

    [Fact]
    public async Task RegisterTenant_CreatesTenantCompanyAndSuperAdmin_Atomically()
    {
        var result = await CreateHandler().Handle(ValidCommand(), CancellationToken.None);

        result.Success.Should().BeTrue();
        result.Data!.TenantName.Should().Be("Acme Group");
        result.Data.CompanyName.Should().Be("Acme Trading");

        var tenant = await Db.Tenants.IgnoreQueryFilters().SingleAsync();
        var company = await Db.Companies.IgnoreQueryFilters().SingleAsync();
        var user = await Db.Users.IgnoreQueryFilters().SingleAsync();

        company.TenantId.Should().Be(tenant.Id);
        company.ActiveModules.Should().Contain(ModuleCatalog.HR); // Phase 1 default

        user.Role.Should().Be(SystemRole.SuperAdmin);
        user.TenantId.Should().Be(tenant.Id);
        user.CompanyId.Should().BeNull(); // CEO is tenant-wide, not company-bound
        user.Email.Should().Be("ceo@acme.test");
    }

    [Fact]
    public async Task RegisterTenant_WithExistingEmail_ThrowsConflict_AndCreatesNothing()
    {
        SeedUser("taken@acme.test"); // any pre-existing account, in any tenant

        var act = () => CreateHandler().Handle(ValidCommand("taken@acme.test"), CancellationToken.None);

        await act.Should().ThrowAsync<ConflictException>();

        // Atomicity: the failed signup must leave NO tenant or company behind
        (await Db.Tenants.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await Db.Companies.IgnoreQueryFilters().CountAsync()).Should().Be(0);
    }

    [Fact]
    public void RegisterTenant_Validator_RejectsWeakPassword()
    {
        var validator = new RegisterTenantValidator();

        var result = validator.Validate(ValidCommand() with { Password = "weakpass" });

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage.Contains("uppercase"));
    }
}
