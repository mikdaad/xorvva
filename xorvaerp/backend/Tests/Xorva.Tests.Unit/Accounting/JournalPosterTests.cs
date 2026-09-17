using FluentAssertions;
using Xorva.Core.Constants;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Commands.CreateManualJournal;
using Xorva.Modules.Accounting.Ledger.Commands.SeedChartOfAccounts;
using Xorva.Modules.Accounting.Ledger.Commands.VoidJournal;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Modules.Accounting.Ledger.Queries.GetTrialBalance;
using Xorva.Tests.Unit.TestHelpers;

namespace Xorva.Tests.Unit.Accounting;

public class JournalPosterTests : AuthHandlerTestBase
{
    private readonly Company _company;
    private static readonly DateTime When = new(2026, 1, 15);

    public JournalPosterTests()
    {
        var tenant = SeedTenant();
        _company = SeedCompany(tenant.Id, "Ledger Co");
        _company.ActiveModules = [ModuleCatalog.Sales, ModuleCatalog.Accounting];
        Db.SaveChanges();
        ActAs(SeedUser("acct@ledger.test", role: SystemRole.CompanyAdmin, tenantId: tenant.Id, companyId: _company.Id));
    }

    private JournalPoster Poster => new(Db, TenantService);
    private CreateManualJournalHandler ManualHandler => new(Db, TenantService, Poster);

    private async Task Seed() =>
        await new SeedChartOfAccountsHandler(Db, TenantService)
            .Handle(new SeedChartOfAccountsCommand { Industry = "General" }, CancellationToken.None);

    private Guid Acct(string code) => Db.Set<Account>().Single(a => a.Code == code).Id;

    [Fact]
    public async Task TrialBalance_AfterPosting_Balances()
    {
        await Seed();
        await ManualHandler.Handle(new CreateManualJournalCommand
        {
            Date = When,
            Lines =
            [
                new() { AccountId = Acct(ChartTemplates.Codes.Bank), Debit = 1500 },
                new() { AccountId = Acct(ChartTemplates.Codes.Sales), Credit = 1500 },
            ],
        }, CancellationToken.None);

        var tb = await new GetTrialBalanceHandler(Db, TenantService)
            .Handle(new GetTrialBalanceQuery(), CancellationToken.None);

        tb.Data!.IsBalanced.Should().BeTrue();
        tb.Data.TotalDebit.Should().Be(1500m);
        tb.Data.TotalCredit.Should().Be(1500m);
        tb.Data.Rows.Should().HaveCount(2);
    }

    [Fact]
    public async Task Post_BalancedJournal_CreatesEntry_AndUpdatesBalances()
    {
        await Seed();
        var bank = Acct(ChartTemplates.Codes.Bank);
        var sales = Acct(ChartTemplates.Codes.Sales);

        var res = await ManualHandler.Handle(new CreateManualJournalCommand
        {
            Date = When,
            Description = "Cash sale",
            Lines =
            [
                new() { AccountId = bank, Debit = 1000 },
                new() { AccountId = sales, Credit = 1000 },
            ],
        }, CancellationToken.None);

        res.Success.Should().BeTrue();
        res.Data!.TotalDebit.Should().Be(1000m);
        res.Data.TotalCredit.Should().Be(1000m);
        res.Data.Lines.Should().HaveCount(2);
        res.Data.Status.Should().Be("Posted");
        res.Data.EntryNumber.Should().StartWith("JV-2026-");

        Db.Set<Account>().Single(a => a.Id == bank).CurrentBalance.Should().Be(1000m);  // asset ↑ on debit
        Db.Set<Account>().Single(a => a.Id == sales).CurrentBalance.Should().Be(1000m); // revenue ↑ on credit
    }

    [Fact]
    public async Task Post_UnbalancedJournal_IsRejected()
    {
        await Seed();
        var act = () => ManualHandler.Handle(new CreateManualJournalCommand
        {
            Date = When,
            Lines =
            [
                new() { AccountId = Acct(ChartTemplates.Codes.Bank), Debit = 1000 },
                new() { AccountId = Acct(ChartTemplates.Codes.Sales), Credit = 900 },
            ],
        }, CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task Post_LineWithBothDebitAndCredit_IsRejected()
    {
        await Seed();
        var act = () => ManualHandler.Handle(new CreateManualJournalCommand
        {
            Date = When,
            Lines =
            [
                new() { AccountId = Acct(ChartTemplates.Codes.Bank), Debit = 500, Credit = 500 },
                new() { AccountId = Acct(ChartTemplates.Codes.Sales), Credit = 500 },
            ],
        }, CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task Void_PostsReversal_MarksOriginalVoided_AndNetsBalancesToZero()
    {
        await Seed();
        var bank = Acct(ChartTemplates.Codes.Bank);
        var sales = Acct(ChartTemplates.Codes.Sales);

        var posted = await ManualHandler.Handle(new CreateManualJournalCommand
        {
            Date = When,
            Description = "Cash sale",
            Lines = [new() { AccountId = bank, Debit = 1000 }, new() { AccountId = sales, Credit = 1000 }],
        }, CancellationToken.None);

        var voidRes = await new VoidJournalHandler(Db, TenantService, Poster)
            .Handle(new VoidJournalCommand { Id = posted.Data!.Id, Reason = "mistake" }, CancellationToken.None);

        voidRes.Success.Should().BeTrue();
        voidRes.Data!.SourceType.Should().Be("Reversal");

        Db.Set<JournalEntry>().Single(e => e.Id == posted.Data.Id).Status.Should().Be(JournalStatus.Voided);
        Db.Set<Account>().Single(a => a.Id == bank).CurrentBalance.Should().Be(0m);
        Db.Set<Account>().Single(a => a.Id == sales).CurrentBalance.Should().Be(0m);
    }

    [Fact]
    public async Task Void_AlreadyVoided_IsRejected()
    {
        await Seed();
        var bank = Acct(ChartTemplates.Codes.Bank);
        var sales = Acct(ChartTemplates.Codes.Sales);
        var posted = await ManualHandler.Handle(new CreateManualJournalCommand
        {
            Date = When,
            Lines = [new() { AccountId = bank, Debit = 1000 }, new() { AccountId = sales, Credit = 1000 }],
        }, CancellationToken.None);

        var voidHandler = new VoidJournalHandler(Db, TenantService, Poster);
        await voidHandler.Handle(new VoidJournalCommand { Id = posted.Data!.Id }, CancellationToken.None);

        var act = () => voidHandler.Handle(new VoidJournalCommand { Id = posted.Data.Id }, CancellationToken.None);
        await act.Should().ThrowAsync<BadRequestException>();
    }
}
