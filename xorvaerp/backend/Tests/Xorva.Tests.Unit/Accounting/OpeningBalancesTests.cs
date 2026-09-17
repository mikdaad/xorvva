using FluentAssertions;
using Xorva.Core.Constants;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Ledger.Commands.PostOpeningBalances;
using Xorva.Modules.Accounting.Ledger.Commands.SeedChartOfAccounts;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Modules.Accounting.Ledger.Queries.GetTrialBalance;
using Xorva.Tests.Unit.TestHelpers;

namespace Xorva.Tests.Unit.Accounting;

public class OpeningBalancesTests : AuthHandlerTestBase
{
    private readonly Company _company;

    public OpeningBalancesTests()
    {
        var tenant = SeedTenant();
        _company = SeedCompany(tenant.Id, "Open Co");
        _company.ActiveModules = [ModuleCatalog.Sales, ModuleCatalog.Accounting];
        Db.SaveChanges();
        ActAs(SeedUser("ob@co.test", role: SystemRole.CompanyAdmin, tenantId: tenant.Id, companyId: _company.Id));
        new SeedChartOfAccountsHandler(Db, TenantService)
            .Handle(new SeedChartOfAccountsCommand { Industry = "General" }, CancellationToken.None).GetAwaiter().GetResult();
    }

    private JournalPoster Poster => new(Db, TenantService);
    private Guid Acct(string code) => Db.Set<Account>().Single(a => a.Code == code).Id;
    private PostOpeningBalancesHandler Handler => new(Db, TenantService, Poster);

    [Fact]
    public async Task Post_SetsBalances_AndBalancesToRetainedEarnings()
    {
        var res = await Handler.Handle(new PostOpeningBalancesCommand
        {
            AsOf = new DateTime(2026, 1, 1),
            Lines =
            [
                new() { AccountId = Acct(ChartTemplates.Codes.Bank), Debit = 5000 },
                new() { AccountId = Acct(ChartTemplates.Codes.AccountsReceivable), Debit = 2000 },
                new() { AccountId = Acct(ChartTemplates.Codes.AccountsPayable), Credit = 1000 },
            ],
        }, CancellationToken.None);

        res.Success.Should().BeTrue();
        Db.Set<Account>().Single(a => a.Id == Acct(ChartTemplates.Codes.Bank)).CurrentBalance.Should().Be(5000m);
        Db.Set<Account>().Single(a => a.Id == Acct(ChartTemplates.Codes.AccountsReceivable)).CurrentBalance.Should().Be(2000m);
        Db.Set<Account>().Single(a => a.Id == Acct(ChartTemplates.Codes.AccountsPayable)).CurrentBalance.Should().Be(1000m);
        // Difference 7,000 Dr − 1,000 Cr = 6,000 → credited to Retained Earnings.
        Db.Set<Account>().Single(a => a.Id == Acct(ChartTemplates.Codes.RetainedEarnings)).CurrentBalance.Should().Be(6000m);

        var tb = await new GetTrialBalanceHandler(Db, TenantService).Handle(new GetTrialBalanceQuery(), CancellationToken.None);
        tb.Data!.IsBalanced.Should().BeTrue();
    }

    [Fact]
    public async Task Post_Twice_IsRejected()
    {
        var cmd = new PostOpeningBalancesCommand
        {
            AsOf = new DateTime(2026, 1, 1),
            Lines = [new() { AccountId = Acct(ChartTemplates.Codes.Bank), Debit = 100 }],
        };
        await Handler.Handle(cmd, CancellationToken.None);

        var act = () => Handler.Handle(cmd, CancellationToken.None);
        await act.Should().ThrowAsync<ConflictException>();
    }
}
