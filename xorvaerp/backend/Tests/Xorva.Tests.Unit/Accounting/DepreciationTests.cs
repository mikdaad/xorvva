using FluentAssertions;
using Xorva.Core.Constants;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Modules.Accounting.Assets.Commands.CreateFixedAsset;
using Xorva.Modules.Accounting.Assets.Commands.RunDepreciation;
using Xorva.Modules.Accounting.Assets.Entities;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Ledger.Commands.SeedChartOfAccounts;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Modules.Accounting.Ledger.Queries.GetTrialBalance;
using Xorva.Tests.Unit.TestHelpers;

namespace Xorva.Tests.Unit.Accounting;

public class DepreciationTests : AuthHandlerTestBase
{
    private readonly Company _company;

    public DepreciationTests()
    {
        var tenant = SeedTenant();
        _company = SeedCompany(tenant.Id, "Assets Co");
        _company.ActiveModules = [ModuleCatalog.Sales, ModuleCatalog.Accounting];
        Db.SaveChanges();
        ActAs(SeedUser("fa@co.test", role: SystemRole.CompanyAdmin, tenantId: tenant.Id, companyId: _company.Id));
        new SeedChartOfAccountsHandler(Db, TenantService)
            .Handle(new SeedChartOfAccountsCommand { Industry = "General" }, CancellationToken.None).GetAwaiter().GetResult();
    }

    private JournalPoster Poster => new(Db, TenantService);
    private Guid Acct(string code) => Db.Set<Account>().Single(a => a.Code == code).Id;

    private async Task<Guid> CreateAsset()
    {
        var res = await new CreateFixedAssetHandler(Db, TenantService).Handle(new CreateFixedAssetCommand
        {
            Name = "Delivery Van", AcquisitionDate = new DateTime(2026, 1, 1),
            Cost = 12000, SalvageValue = 0, UsefulLifeMonths = 12,
            AssetAccountId = Acct("1500"),
            AccumulatedDepreciationAccountId = Acct("1510"),
            DepreciationExpenseAccountId = Acct("6400"),
        }, CancellationToken.None);
        return res.Data!.Id;
    }

    [Fact]
    public async Task RunDepreciation_PostsMonthlyStraightLine()
    {
        var id = await CreateAsset();

        var res = await new RunDepreciationHandler(Db, TenantService, Poster)
            .Handle(new RunDepreciationCommand { Year = 2026, Month = 6 }, CancellationToken.None);

        res.Data!.AssetsDepreciated.Should().Be(1);
        res.Data.TotalDepreciation.Should().Be(1000m);   // 12,000 / 12

        var asset = Db.Set<FixedAsset>().Single(a => a.Id == id);
        asset.AccumulatedDepreciation.Should().Be(1000m);
        Db.Set<Account>().Single(a => a.Id == Acct("6400")).CurrentBalance.Should().Be(1000m); // Depreciation Expense

        var tb = await new GetTrialBalanceHandler(Db, TenantService).Handle(new GetTrialBalanceQuery(), CancellationToken.None);
        tb.Data!.IsBalanced.Should().BeTrue();
    }

    [Fact]
    public async Task RunDepreciation_SameMonthTwice_IsRejected()
    {
        await CreateAsset();
        var h = new RunDepreciationHandler(Db, TenantService, Poster);
        await h.Handle(new RunDepreciationCommand { Year = 2026, Month = 6 }, CancellationToken.None);

        var act = () => h.Handle(new RunDepreciationCommand { Year = 2026, Month = 6 }, CancellationToken.None);
        await act.Should().ThrowAsync<ConflictException>();
    }
}
