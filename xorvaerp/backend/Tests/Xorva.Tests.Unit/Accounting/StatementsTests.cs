using FluentAssertions;
using Xorva.Core.Constants;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Contacts.Commands.CreateContact;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Commands.SeedChartOfAccounts;
using Xorva.Modules.Accounting.Reports.Queries.GetBalanceSheet;
using Xorva.Modules.Accounting.Reports.Queries.GetProfitAndLoss;
using Xorva.Modules.Accounting.Sales.Commands.CreateInvoice;
using Xorva.Modules.Accounting.Sales.Commands.PostInvoice;
using Xorva.Modules.Accounting.Tax.Commands.SeedTaxRates;
using Xorva.Modules.Accounting.Tax.Entities;
using Xorva.Tests.Unit.TestHelpers;

namespace Xorva.Tests.Unit.Accounting;

public class StatementsTests : AuthHandlerTestBase
{
    private readonly Company _company;
    private static readonly DateTime When = new(2026, 4, 12);

    public StatementsTests()
    {
        var tenant = SeedTenant();
        _company = SeedCompany(tenant.Id, "Reports Co");
        _company.ActiveModules = [ModuleCatalog.Sales, ModuleCatalog.Accounting];
        Db.SaveChanges();
        ActAs(SeedUser("rep@co.test", role: SystemRole.CompanyAdmin, tenantId: tenant.Id, companyId: _company.Id));
    }

    private JournalPoster Poster => new(Db, TenantService);

    /// <summary>Post a 10,000 + 5% VAT invoice so the ledger has real movement.</summary>
    private async Task PostAnInvoice()
    {
        await new SeedChartOfAccountsHandler(Db, TenantService).Handle(new SeedChartOfAccountsCommand { Industry = "General" }, CancellationToken.None);
        await new SeedTaxRatesHandler(Db, TenantService).Handle(new SeedTaxRatesCommand(), CancellationToken.None);
        var contact = await new CreateContactHandler(Db, TenantService).Handle(new CreateContactCommand
        { Code = "C1", Name = "Cust", ContactType = ContactType.Customer }, CancellationToken.None);
        var vat5 = Db.Set<TaxRate>().First(t => t.Rate == 5m).Id;
        var inv = await new CreateInvoiceHandler(Db, TenantService).Handle(new CreateInvoiceCommand
        {
            ContactId = contact.Data!.Id, Date = When,
            Lines = [new() { Description = "Consulting", Quantity = 1, UnitPrice = 10000, TaxRateId = vat5 }],
        }, CancellationToken.None);
        await new PostInvoiceHandler(Db, TenantService, Poster).Handle(new PostInvoiceCommand { Id = inv.Data!.Id }, CancellationToken.None);
    }

    [Fact]
    public async Task ProfitAndLoss_ShowsRevenue_AndNetProfit()
    {
        await PostAnInvoice();

        var pnl = await new GetProfitAndLossHandler(Db, TenantService)
            .Handle(new GetProfitAndLossQuery { From = new DateTime(2026, 1, 1), To = new DateTime(2026, 12, 31) }, CancellationToken.None);

        pnl.Data!.TotalRevenue.Should().Be(10000m);   // VAT is not revenue
        pnl.Data.TotalExpenses.Should().Be(0m);
        pnl.Data.NetProfit.Should().Be(10000m);
        pnl.Data.Revenue.Should().ContainSingle();
    }

    [Fact]
    public async Task BalanceSheet_Balances_WithCurrentYearEarnings()
    {
        await PostAnInvoice();

        var bs = await new GetBalanceSheetHandler(Db, TenantService)
            .Handle(new GetBalanceSheetQuery { AsOf = new DateTime(2026, 12, 31) }, CancellationToken.None);

        // Assets: AR 10,500. Liabilities: VAT-Output 500. Equity: current earnings 10,000.
        bs.Data!.TotalAssets.Should().Be(10500m);
        bs.Data.TotalLiabilities.Should().Be(500m);
        bs.Data.CurrentYearEarnings.Should().Be(10000m);
        bs.Data.TotalEquity.Should().Be(10000m);
        bs.Data.IsBalanced.Should().BeTrue();
    }
}
