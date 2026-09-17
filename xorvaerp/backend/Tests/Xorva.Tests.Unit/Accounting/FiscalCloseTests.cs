using FluentAssertions;
using Xorva.Core.Constants;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Ledger.Commands.CloseYear;
using Xorva.Modules.Accounting.Ledger.Commands.CreateFiscalYear;
using Xorva.Modules.Accounting.Ledger.Commands.CreateManualJournal;
using Xorva.Modules.Accounting.Ledger.Commands.SeedChartOfAccounts;
using Xorva.Modules.Accounting.Ledger.Commands.SetFiscalPeriodClosed;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Tests.Unit.TestHelpers;

namespace Xorva.Tests.Unit.Accounting;

public class FiscalCloseTests : AuthHandlerTestBase
{
    private readonly Company _company;

    public FiscalCloseTests()
    {
        var tenant = SeedTenant();
        _company = SeedCompany(tenant.Id, "Close Co");
        _company.ActiveModules = [ModuleCatalog.Sales, ModuleCatalog.Accounting];
        Db.SaveChanges();
        ActAs(SeedUser("cl@co.test", role: SystemRole.CompanyAdmin, tenantId: tenant.Id, companyId: _company.Id));
        new SeedChartOfAccountsHandler(Db, TenantService)
            .Handle(new SeedChartOfAccountsCommand { Industry = "General" }, CancellationToken.None).GetAwaiter().GetResult();
    }

    private JournalPoster Poster => new(Db, TenantService);
    private Guid Acct(string code) => Db.Set<Account>().Single(a => a.Code == code).Id;

    [Fact]
    public async Task CreateFiscalYear_Creates12Periods()
    {
        var res = await new CreateFiscalYearHandler(Db, TenantService)
            .Handle(new CreateFiscalYearCommand { Year = 2026 }, CancellationToken.None);

        res.Data!.Name.Should().Be("FY2026");
        res.Data.Periods.Should().HaveCount(12);
    }

    [Fact]
    public async Task ClosedPeriod_BlocksPostingIntoIt()
    {
        var year = await new CreateFiscalYearHandler(Db, TenantService)
            .Handle(new CreateFiscalYearCommand { Year = 2026 }, CancellationToken.None);
        var june = year.Data!.Periods.Single(p => p.StartDate.Month == 6);

        await new SetFiscalPeriodClosedHandler(Db, TenantService)
            .Handle(new SetFiscalPeriodClosedCommand { Id = june.Id, IsClosed = true }, CancellationToken.None);

        var manual = new CreateManualJournalHandler(Db, TenantService, Poster);
        var act = () => manual.Handle(new CreateManualJournalCommand
        {
            Date = new DateTime(2026, 6, 15),
            Lines =
            [
                new() { AccountId = Acct(ChartTemplates.Codes.Bank), Debit = 100 },
                new() { AccountId = Acct(ChartTemplates.Codes.Sales), Credit = 100 },
            ],
        }, CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task CloseYear_RollsNetProfitToRetainedEarnings_AndZeroesPnl()
    {
        var year = await new CreateFiscalYearHandler(Db, TenantService)
            .Handle(new CreateFiscalYearCommand { Year = 2026 }, CancellationToken.None);

        // Book revenue: DR Bank 1,000 / CR Sales 1,000.
        await new CreateManualJournalHandler(Db, TenantService, Poster).Handle(new CreateManualJournalCommand
        {
            Date = new DateTime(2026, 6, 15),
            Lines =
            [
                new() { AccountId = Acct(ChartTemplates.Codes.Bank), Debit = 1000 },
                new() { AccountId = Acct(ChartTemplates.Codes.Sales), Credit = 1000 },
            ],
        }, CancellationToken.None);

        var res = await new CloseYearHandler(Db, TenantService, Poster)
            .Handle(new CloseYearCommand { Id = year.Data!.Id }, CancellationToken.None);

        res.Data!.IsClosed.Should().BeTrue();
        res.Data.Periods.Should().OnlyContain(p => p.IsClosed);
        Db.Set<Account>().Single(a => a.Id == Acct(ChartTemplates.Codes.Sales)).CurrentBalance.Should().Be(0m);        // P&L zeroed
        Db.Set<Account>().Single(a => a.Id == Acct(ChartTemplates.Codes.RetainedEarnings)).CurrentBalance.Should().Be(1000m); // profit → equity
    }
}
