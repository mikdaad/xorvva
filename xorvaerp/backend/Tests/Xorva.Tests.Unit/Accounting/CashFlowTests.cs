using FluentAssertions;
using Xorva.Core.Constants;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Ledger.Commands.CreateManualJournal;
using Xorva.Modules.Accounting.Ledger.Commands.SeedChartOfAccounts;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Modules.Accounting.Reports.Queries.GetCashFlow;
using Xorva.Tests.Unit.TestHelpers;

namespace Xorva.Tests.Unit.Accounting;

public class CashFlowTests : AuthHandlerTestBase
{
    private readonly Company _company;

    public CashFlowTests()
    {
        var tenant = SeedTenant();
        _company = SeedCompany(tenant.Id, "Cash Co");
        _company.ActiveModules = [ModuleCatalog.Sales, ModuleCatalog.Accounting];
        Db.SaveChanges();
        ActAs(SeedUser("cf@co.test", role: SystemRole.CompanyAdmin, tenantId: tenant.Id, companyId: _company.Id));
        new SeedChartOfAccountsHandler(Db, TenantService)
            .Handle(new SeedChartOfAccountsCommand { Industry = "General" }, CancellationToken.None).GetAwaiter().GetResult();
    }

    private JournalPoster Poster => new(Db, TenantService);
    private Guid Acct(string code) => Db.Set<Account>().Single(a => a.Code == code).Id;

    [Fact]
    public async Task CashFlow_ReportsInflowsOutflows_AndClosing()
    {
        var manual = new CreateManualJournalHandler(Db, TenantService, Poster);
        // Cash in 5,000
        await manual.Handle(new CreateManualJournalCommand
        {
            Date = new DateTime(2026, 3, 10),
            Lines = [new() { AccountId = Acct(ChartTemplates.Codes.Bank), Debit = 5000 }, new() { AccountId = Acct(ChartTemplates.Codes.Sales), Credit = 5000 }],
        }, CancellationToken.None);
        // Cash out 1,000
        await manual.Handle(new CreateManualJournalCommand
        {
            Date = new DateTime(2026, 3, 20),
            Lines = [new() { AccountId = Acct("6100"), Debit = 1000 }, new() { AccountId = Acct(ChartTemplates.Codes.Bank), Credit = 1000 }],
        }, CancellationToken.None);

        var cf = await new GetCashFlowHandler(Db, TenantService).Handle(new GetCashFlowQuery
        {
            From = new DateTime(2026, 1, 1), To = new DateTime(2026, 12, 31),
        }, CancellationToken.None);

        cf.Data!.OpeningCash.Should().Be(0m);
        cf.Data.TotalInflows.Should().Be(5000m);
        cf.Data.TotalOutflows.Should().Be(1000m);
        cf.Data.NetChange.Should().Be(4000m);
        cf.Data.ClosingCash.Should().Be(4000m);
        cf.Data.Activities.Should().ContainSingle(r => r.Category == "Manual entries" && r.Amount == 4000m);
    }
}
