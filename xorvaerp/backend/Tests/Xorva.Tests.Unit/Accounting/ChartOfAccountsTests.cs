using FluentAssertions;
using Xorva.Core.Constants;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Commands.SeedChartOfAccounts;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Tests.Unit.TestHelpers;

namespace Xorva.Tests.Unit.Accounting;

public class ChartOfAccountsTests : AuthHandlerTestBase
{
    private readonly Company _company;

    public ChartOfAccountsTests()
    {
        var tenant = SeedTenant();
        _company = SeedCompany(tenant.Id, "Trading LLC");
        _company.ActiveModules = [ModuleCatalog.Sales, ModuleCatalog.Accounting];
        Db.SaveChanges();

        var admin = SeedUser("admin@trading.test", role: SystemRole.CompanyAdmin,
            tenantId: tenant.Id, companyId: _company.Id);
        ActAs(admin);
    }

    private SeedChartOfAccountsHandler Handler => new(Db, TenantService);

    [Fact]
    public async Task Seed_GeneralTemplate_CreatesTheAccounts()
    {
        var result = await Handler.Handle(new SeedChartOfAccountsCommand { Industry = "General" }, CancellationToken.None);

        result.Success.Should().BeTrue();
        result.Data.Should().Be(ChartTemplates.For("General").Count);

        var accounts = Db.Set<Account>().Where(a => a.CompanyId == _company.Id).ToList();
        accounts.Should().HaveCount(ChartTemplates.For("General").Count);
    }

    [Fact]
    public async Task Seed_FlagsSystemAccounts_WithCorrectNormalBalance()
    {
        await Handler.Handle(new SeedChartOfAccountsCommand { Industry = "General" }, CancellationToken.None);

        var ar = Db.Set<Account>().Single(a => a.Code == ChartTemplates.Codes.AccountsReceivable);
        ar.IsSystemAccount.Should().BeTrue();
        ar.AccountType.Should().Be(AccountType.Asset);
        ar.NormalBalance.Should().Be(NormalBalance.Debit);   // assets increase on debit

        var sales = Db.Set<Account>().Single(a => a.Code == ChartTemplates.Codes.Sales);
        sales.IsSystemAccount.Should().BeTrue();
        sales.NormalBalance.Should().Be(NormalBalance.Credit); // revenue increases on credit
    }

    [Theory]
    [InlineData("Construction")]
    [InlineData("Staffing")]
    [InlineData("Software")]
    [InlineData("Trading")]
    public async Task Seed_EveryTemplate_ContainsAllSystemPostingAccounts(string industry)
    {
        await Handler.Handle(new SeedChartOfAccountsCommand { Industry = industry }, CancellationToken.None);

        // The engine posts to these — every template MUST contain them.
        string[] required =
        [
            ChartTemplates.Codes.Bank, ChartTemplates.Codes.AccountsReceivable, ChartTemplates.Codes.VatInput,
            ChartTemplates.Codes.AccountsPayable, ChartTemplates.Codes.VatOutput, ChartTemplates.Codes.RetainedEarnings,
            ChartTemplates.Codes.Sales, ChartTemplates.Codes.Cogs, ChartTemplates.Codes.SalaryExpense,
            ChartTemplates.Codes.SalaryPayable, ChartTemplates.Codes.Rounding,
        ];

        var codes = Db.Set<Account>().Where(a => a.CompanyId == _company.Id).Select(a => a.Code).ToList();
        codes.Should().Contain(required);
    }

    [Fact]
    public async Task Seed_Twice_ThrowsConflict()
    {
        await Handler.Handle(new SeedChartOfAccountsCommand { Industry = "General" }, CancellationToken.None);

        var act = () => Handler.Handle(new SeedChartOfAccountsCommand { Industry = "General" }, CancellationToken.None);
        await act.Should().ThrowAsync<ConflictException>();
    }

    [Fact]
    public async Task Seed_UnknownIndustry_ThrowsBadRequest()
    {
        var act = () => Handler.Handle(new SeedChartOfAccountsCommand { Industry = "Nonsense" }, CancellationToken.None);
        await act.Should().ThrowAsync<BadRequestException>();
    }
}
