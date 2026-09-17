using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Modules.Auth.Commands.RegisterUser;
using Xorva.Modules.Auth.Services;
using Xorva.Tests.Unit.TestHelpers;

namespace Xorva.Tests.Unit.Auth;

public class RegisterUserCommandHandlerTests : AuthHandlerTestBase
{
    private RegisterUserCommandHandler CreateHandler() =>
        new(new UserProvisioningService(Db, Hasher, TenantService));

    [Fact]
    public async Task RegisterUser_WithValidData_CreatesUser()
    {
        var tenant = SeedTenant();
        var tenantId = tenant.Id;
        var company = SeedCompany(tenantId);
        var superAdmin = SeedUser("ceo@acme.com", role: SystemRole.SuperAdmin, tenantId: tenantId);
        ActAs(superAdmin);

        var command = new RegisterUserCommand
        {
            Email = "GM@Acme.com",
            Password = "Password@123",
            FirstName = "General",
            LastName = "Manager",
            Role = SystemRole.CompanyAdmin,
            CompanyId = company.Id
        };

        var result = await CreateHandler().Handle(command, CancellationToken.None);

        result.Success.Should().BeTrue();
        result.Data!.Email.Should().Be("gm@acme.com"); // normalized to lowercase
        result.Data.Role.Should().Be(SystemRole.CompanyAdmin);
        result.Data.TenantId.Should().Be(tenantId);    // forced into caller's tenant

        var saved = await Db.Users.IgnoreQueryFilters()
            .SingleAsync(u => u.Email == "gm@acme.com");
        saved.PasswordHash.Should().NotBe("Password@123"); // never stored in plain text
        Hasher.Verify("Password@123", saved.PasswordHash).Should().BeTrue();
    }

    [Fact]
    public async Task RegisterUser_WithDuplicateEmail_ThrowsConflict()
    {
        var tenantId = SeedTenant().Id;
        var superAdmin = SeedUser("ceo@acme.com", role: SystemRole.SuperAdmin, tenantId: tenantId);
        var companyId = SeedCompany(tenantId).Id;
        SeedUser("existing@acme.com", role: SystemRole.Employee, tenantId: tenantId);
        ActAs(superAdmin);

        var command = new RegisterUserCommand
        {
            Email = "existing@acme.com",
            Password = "Password@123",
            FirstName = "Dup",
            LastName = "User",
            Role = SystemRole.Employee,
            CompanyId = companyId
        };

        var act = () => CreateHandler().Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<ConflictException>();
    }

    [Fact]
    public async Task RegisterUser_CompanyRoleWithoutCompany_ThrowsBadRequest()
    {
        // A CEO creating a Company Admin MUST choose a company — otherwise the admin is
        // orphaned (no company → can't see or manage anything).
        var tenantId = Guid.NewGuid();
        var superAdmin = SeedUser("ceo@acme.com", role: SystemRole.SuperAdmin, tenantId: tenantId);
        ActAs(superAdmin);

        var command = new RegisterUserCommand
        {
            Email = "gm@acme.com",
            Password = "Password@123",
            FirstName = "No",
            LastName = "Company",
            Role = SystemRole.CompanyAdmin // company-scoped, but no CompanyId given
        };

        var act = () => CreateHandler().Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task RegisterUser_CompanyAdmin_CannotCreateSuperAdmin()
    {
        var companyAdmin = SeedUser("gm@acme.com",
            role: SystemRole.CompanyAdmin, tenantId: Guid.NewGuid(), companyId: Guid.NewGuid());
        ActAs(companyAdmin);

        var command = new RegisterUserCommand
        {
            Email = "sneaky@acme.com",
            Password = "Password@123",
            FirstName = "Sneaky",
            LastName = "User",
            Role = SystemRole.SuperAdmin
        };

        var act = () => CreateHandler().Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task RegisterUser_CannotCreateEqualRole()
    {
        var superAdmin = SeedUser("ceo@acme.com", role: SystemRole.SuperAdmin, tenantId: Guid.NewGuid());
        ActAs(superAdmin);

        var command = new RegisterUserCommand
        {
            Email = "ceo2@acme.com",
            Password = "Password@123",
            FirstName = "Second",
            LastName = "Ceo",
            Role = SystemRole.SuperAdmin // equal to caller — must be rejected
        };

        var act = () => CreateHandler().Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task RegisterUser_CompanyAdmin_IsForcedIntoOwnCompany()
    {
        var tenant = SeedTenant();
        var tenantId = tenant.Id;
        var ownCompanyId = SeedCompany(tenantId).Id;
        var companyAdmin = SeedUser("gm@acme.com",
            role: SystemRole.CompanyAdmin, tenantId: tenantId, companyId: ownCompanyId);
        ActAs(companyAdmin);

        var command = new RegisterUserCommand
        {
            Email = "emp@acme.com",
            Password = "Password@123",
            FirstName = "New",
            LastName = "Employee",
            Role = SystemRole.Employee,
            TenantId = Guid.NewGuid(),   // attacker-controlled values —
            CompanyId = Guid.NewGuid()   // must be overridden by the handler
        };

        var result = await CreateHandler().Handle(command, CancellationToken.None);

        result.Data!.TenantId.Should().Be(tenantId);
        result.Data.CompanyId.Should().Be(ownCompanyId);
    }
}
