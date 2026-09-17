using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Enums;
using Xorva.Infrastructure.Modules;
using Xorva.Modules.Accounting.Extensions;
using Xorva.Modules.Commerce.Extensions;
using Xorva.Modules.HR.Extensions;
using Xorva.Modules.Tenants.Commands.SetCompanyModules;
using Xorva.Modules.Tenants.Commands.SetTenantSubscriptionModules;
using Xorva.Modules.Tenants.Queries.GetTenantSubscription;
using Xorva.Tests.Unit.TestHelpers;

namespace Xorva.Tests.Unit.Tenants;

/// <summary>
/// Tenant-level module subscription: dependency expansion (Commerce pulls Accounting),
/// auto-subscribe when a company activates a module, and cascade removal on unsubscribe.
/// </summary>
public class TenantSubscriptionTests : AuthHandlerTestBase
{
    private readonly ModuleRegistry _modules = ModuleRegistry.Discover(
        typeof(HrModule).Assembly, typeof(AccountingModule).Assembly, typeof(CommerceModule).Assembly);
    private readonly Guid _tenantId;

    public TenantSubscriptionTests()
    {
        _tenantId = SeedTenant().Id;
        TenantService.SetTenant(Guid.NewGuid(), _tenantId, Guid.Empty, SystemRole.SuperAdmin, "ceo@t.test");
    }

    [Fact]
    public async Task Subscribe_ToModules_StoresThem()
    {
        var res = await new SetTenantSubscriptionModulesHandler(Db, TenantService, _modules)
            .Handle(new SetTenantSubscriptionModulesCommand { Modules = ["Sales", "Accounting"] }, default);

        res.Success.Should().BeTrue();
        res.Data!.SubscribedModules.Should().BeEquivalentTo(["Accounting", "Sales"]);
    }

    [Fact]
    public async Task Subscribe_ToUnknownModule_IsRejected()
    {
        var act = () => new SetTenantSubscriptionModulesHandler(Db, TenantService, _modules)
            .Handle(new SetTenantSubscriptionModulesCommand { Modules = ["Blockchain"] }, default);

        await act.Should().ThrowAsync<Xorva.Core.Exceptions.BadRequestException>();
    }

    [Fact]
    public async Task ActivatingCompanyModule_AutoSubscribesTenant()
    {
        var company = SeedCompany(_tenantId, "Trading");

        var res = await new SetCompanyModulesCommandHandler(Db, _modules)
            .Handle(new SetCompanyModulesCommand { CompanyId = company.Id, Modules = ["Sales"] }, default);

        res.Data!.ActiveModules.Should().BeEquivalentTo(["Sales"]);

        // Tenant is now subscribed to what its company uses.
        var sub = await new GetTenantSubscriptionHandler(Db, TenantService, _modules)
            .Handle(new GetTenantSubscriptionQuery(), default);
        sub.Data!.SubscribedModules.Should().Contain("Sales");
    }

    [Fact]
    public async Task Subscribe_ActivatesNewModuleOnCompanies()
    {
        var company = SeedCompany(_tenantId, "Trading");
        company.ActiveModules = ["HR"];
        await Db.SaveChangesAsync();

        // Turning a module ON at the tenant level should activate it on the companies too
        // (symmetric with unsubscribe, so the marketplace toggle is visible both ways).
        await new SetTenantSubscriptionModulesHandler(Db, TenantService, _modules)
            .Handle(new SetTenantSubscriptionModulesCommand { Modules = ["HR", "Accounting"] }, default);

        var reloaded = await Db.Companies.IgnoreQueryFilters().FirstAsync(c => c.Id == company.Id);
        reloaded.ActiveModules.Should().Contain("Accounting").And.Contain("HR");
    }

    [Fact]
    public async Task Unsubscribe_RemovesModuleFromCompaniesUsingIt()
    {
        var company = SeedCompany(_tenantId, "Trading");
        company.ActiveModules = ["Accounting", "Sales", "HR"];
        await Db.SaveChangesAsync();

        await new SetTenantSubscriptionModulesHandler(Db, TenantService, _modules)
            .Handle(new SetTenantSubscriptionModulesCommand { Modules = ["HR"] }, default);

        var reloaded = await Db.Companies.IgnoreQueryFilters().FirstAsync(c => c.Id == company.Id);
        reloaded.ActiveModules.Should().BeEquivalentTo(["HR"]);
    }
}
