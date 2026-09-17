using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Infrastructure.Modules;
using Xorva.Modules.Accounting.Extensions;
using Xorva.Modules.Commerce.Extensions;
using Xorva.Modules.HR.Extensions;
using Xorva.Modules.Tenants.Commands.CreateBranch;
using Xorva.Modules.Tenants.Commands.CreateCompany;
using Xorva.Modules.Tenants.Commands.UpdateCompanySettings;
using Xorva.Modules.Tenants.Queries.ListCompanies;
using Xorva.Tests.Unit.TestHelpers;

namespace Xorva.Tests.Unit.Tenants;

public class CompanyAndBranchHandlerTests : AuthHandlerTestBase
{
    private readonly Guid _tenantId;

    // The installed modules the handlers validate/expand against.
    private readonly ModuleRegistry _modules = ModuleRegistry.Discover(
        typeof(HrModule).Assembly, typeof(AccountingModule).Assembly, typeof(CommerceModule).Assembly);

    public CompanyAndBranchHandlerTests()
    {
        // FK integrity: Companies require an existing Tenant row (as in production)
        _tenantId = SeedTenant().Id;
    }

    private Company SeedCompany(string name, Guid? tenantId = null) =>
        SeedCompany(tenantId ?? _tenantId, name);

    private void ActAsSuperAdmin() =>
        TenantService.SetTenant(Guid.NewGuid(), _tenantId, Guid.Empty, SystemRole.SuperAdmin, "ceo@t.test");

    private void ActAsCompanyAdmin(Guid companyId) =>
        TenantService.SetTenant(Guid.NewGuid(), _tenantId, companyId, SystemRole.CompanyAdmin, "gm@t.test");

    // ─── CreateCompany ──────────────────────────────────────────

    [Fact]
    public async Task CreateCompany_CreatesInCallerTenant_WithDefaults()
    {
        ActAsSuperAdmin();

        var result = await new CreateCompanyCommandHandler(Db, TenantService, _modules)
            .Handle(new CreateCompanyCommand { Name = "New Venture" }, CancellationToken.None);

        result.Data!.Currency.Should().Be("AED");
        result.Data.Timezone.Should().Be("Asia/Dubai");

        var saved = await Db.Companies.IgnoreQueryFilters().SingleAsync();
        saved.TenantId.Should().Be(_tenantId);
    }

    [Fact]
    public async Task CreateCompany_DuplicateNameInTenant_ThrowsConflict()
    {
        SeedCompany("Trading LLC");
        ActAsSuperAdmin();

        var act = () => new CreateCompanyCommandHandler(Db, TenantService, _modules)
            .Handle(new CreateCompanyCommand { Name = "Trading LLC" }, CancellationToken.None);

        await act.Should().ThrowAsync<ConflictException>();
    }

    [Fact]
    public async Task CreateCompany_UnknownModule_ThrowsBadRequest()
    {
        ActAsSuperAdmin();

        var act = () => new CreateCompanyCommandHandler(Db, TenantService, _modules)
            .Handle(new CreateCompanyCommand { Name = "X", ActiveModules = ["Blockchain"] }, CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>();
    }

    // ─── UpdateCompanySettings ──────────────────────────────────

    [Fact]
    public async Task UpdateSettings_CompanyAdmin_OwnCompany_Succeeds()
    {
        var company = SeedCompany("Mine");
        ActAsCompanyAdmin(company.Id);

        var result = await new UpdateCompanySettingsCommandHandler(Db, TenantService).Handle(
            new UpdateCompanySettingsCommand
            {
                CompanyId = company.Id,
                Name = "Mine Renamed",
                Currency = "usd",
                Timezone = "Asia/Riyadh"
            }, CancellationToken.None);

        result.Data!.Name.Should().Be("Mine Renamed");
        result.Data.Currency.Should().Be("USD"); // normalized
    }

    [Fact]
    public async Task UpdateSettings_CompanyAdmin_OtherCompany_ThrowsForbidden()
    {
        var mine = SeedCompany("Mine");
        var other = SeedCompany("Other");
        ActAsCompanyAdmin(mine.Id);

        var act = () => new UpdateCompanySettingsCommandHandler(Db, TenantService).Handle(
            new UpdateCompanySettingsCommand
            {
                CompanyId = other.Id,
                Name = "Hijacked",
                Currency = "USD",
                Timezone = "Asia/Dubai"
            }, CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    // ─── CreateBranch ───────────────────────────────────────────

    [Fact]
    public async Task CreateBranch_CompanyAdmin_OtherCompany_ThrowsForbidden()
    {
        var mine = SeedCompany("Mine");
        var other = SeedCompany("Other");
        ActAsCompanyAdmin(mine.Id);

        var act = () => new CreateBranchCommandHandler(Db, TenantService).Handle(
            new CreateBranchCommand { CompanyId = other.Id, Name = "Sneaky Branch" }, CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task CreateBranch_CompanyInAnotherTenant_ThrowsNotFound()
    {
        // Company exists — but in a DIFFERENT tenant. The tenant filter must hide
        // it completely: "not found", never "forbidden" (403 would leak existence).
        var foreignTenant = SeedTenant();
        var foreign = SeedCompany("Foreign Co", tenantId: foreignTenant.Id);
        ActAsSuperAdmin();

        var act = () => new CreateBranchCommandHandler(Db, TenantService).Handle(
            new CreateBranchCommand { CompanyId = foreign.Id, Name = "Cross-tenant Branch" }, CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    // ─── ListCompanies role scoping ─────────────────────────────

    [Fact]
    public async Task ListCompanies_SuperAdmin_SeesAll_CompanyAdmin_SeesOwnOnly()
    {
        var c1 = SeedCompany("Alpha");
        SeedCompany("Beta");

        ActAsSuperAdmin();
        var all = await new ListCompaniesQueryHandler(Db, TenantService)
            .Handle(new ListCompaniesQuery(), CancellationToken.None);
        all.Data!.Count.Should().Be(2);

        ActAsCompanyAdmin(c1.Id);
        var own = await new ListCompaniesQueryHandler(Db, TenantService)
            .Handle(new ListCompaniesQuery(), CancellationToken.None);
        own.Data!.Should().ContainSingle(c => c.Name == "Alpha");
    }

    // ─── The global filter itself ───────────────────────────────

    [Fact]
    public async Task BranchQueryFilter_ConfinesUsersToTenant_AndNonAdminsToCompany()
    {
        var companyA = SeedCompany("A-Co");
        var companyB = SeedCompany("B-Co");
        var foreignTenant = SeedTenant();
        var foreignCompany = SeedCompany("Foreign-Co", tenantId: foreignTenant.Id);

        Db.Branches.AddRange(
            new Branch { TenantId = _tenantId, CompanyId = companyA.Id, Name = "A-Branch" },
            new Branch { TenantId = _tenantId, CompanyId = companyB.Id, Name = "B-Branch" },
            new Branch { TenantId = foreignTenant.Id, CompanyId = foreignCompany.Id, Name = "Foreign-Branch" });
        Db.SaveChanges();

        // SuperAdmin: everything in own tenant, nothing from the foreign tenant
        ActAsSuperAdmin();
        var ceoSees = await Db.Branches.Select(b => b.Name).ToListAsync();
        ceoSees.Should().BeEquivalentTo(["A-Branch", "B-Branch"]);

        // CompanyAdmin of A: only A's branch
        ActAsCompanyAdmin(companyA.Id);
        var gmSees = await Db.Branches.Select(b => b.Name).ToListAsync();
        gmSees.Should().BeEquivalentTo(["A-Branch"]);
    }
}
