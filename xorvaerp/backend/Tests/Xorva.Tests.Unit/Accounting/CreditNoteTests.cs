using FluentAssertions;
using Xorva.Core.Constants;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Contacts.Commands.CreateContact;
using Xorva.Modules.Accounting.Contacts.Entities;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Commands.SeedChartOfAccounts;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Modules.Accounting.Ledger.Queries.GetTrialBalance;
using Xorva.Modules.Accounting.Sales.Commands.CreateCreditNote;
using Xorva.Modules.Accounting.Sales.Commands.CreateInvoice;
using Xorva.Modules.Accounting.Sales.Commands.PostInvoice;
using Xorva.Modules.Accounting.Tax.Commands.SeedTaxRates;
using Xorva.Modules.Accounting.Tax.Entities;
using Xorva.Tests.Unit.TestHelpers;

namespace Xorva.Tests.Unit.Accounting;

public class CreditNoteTests : AuthHandlerTestBase
{
    private readonly Company _company;
    private static readonly DateTime When = new(2026, 7, 3);

    public CreditNoteTests()
    {
        var tenant = SeedTenant();
        _company = SeedCompany(tenant.Id, "CN Co");
        _company.ActiveModules = [ModuleCatalog.Sales, ModuleCatalog.Accounting];
        Db.SaveChanges();
        ActAs(SeedUser("cn@co.test", role: SystemRole.CompanyAdmin, tenantId: tenant.Id, companyId: _company.Id));
    }

    private JournalPoster Poster => new(Db, TenantService);
    private Guid Acct(string code) => Db.Set<Account>().Single(a => a.Code == code).Id;

    [Fact]
    public async Task CreditNote_ReversesRevenueVatAndReceivable()
    {
        await new SeedChartOfAccountsHandler(Db, TenantService).Handle(new SeedChartOfAccountsCommand { Industry = "General" }, CancellationToken.None);
        await new SeedTaxRatesHandler(Db, TenantService).Handle(new SeedTaxRatesCommand(), CancellationToken.None);
        var contact = await new CreateContactHandler(Db, TenantService).Handle(new CreateContactCommand
        { Code = "C1", Name = "Cust", ContactType = ContactType.Customer }, CancellationToken.None);
        var vat5 = Db.Set<TaxRate>().First(t => t.Rate == 5m).Id;

        // Invoice 10,000 + 5% VAT → AR 10,500.
        var inv = await new CreateInvoiceHandler(Db, TenantService).Handle(new CreateInvoiceCommand
        {
            ContactId = contact.Data!.Id, Date = When,
            Lines = [new() { Description = "Widgets", Quantity = 1, UnitPrice = 10000, TaxRateId = vat5 }],
        }, CancellationToken.None);
        await new PostInvoiceHandler(Db, TenantService, Poster).Handle(new PostInvoiceCommand { Id = inv.Data!.Id }, CancellationToken.None);

        // Credit note 2,000 + 5% VAT = 2,100.
        var cn = await new CreateCreditNoteHandler(Db, TenantService, Poster).Handle(new CreateCreditNoteCommand
        {
            ContactId = contact.Data.Id, InvoiceId = inv.Data.Id, Date = When, Reason = "2 returned",
            Lines = [new() { Description = "Return", Quantity = 1, UnitPrice = 2000, TaxRateId = vat5 }],
        }, CancellationToken.None);

        cn.Data!.Total.Should().Be(2100m);
        cn.Data.Number.Should().StartWith("CN-2026-");

        Db.Set<Account>().Single(a => a.Id == Acct(ChartTemplates.Codes.AccountsReceivable)).CurrentBalance.Should().Be(8400m); // 10,500 − 2,100
        Db.Set<Account>().Single(a => a.Id == Acct(ChartTemplates.Codes.Sales)).CurrentBalance.Should().Be(8000m);              // 10,000 − 2,000
        Db.Set<Account>().Single(a => a.Id == Acct(ChartTemplates.Codes.VatOutput)).CurrentBalance.Should().Be(400m);           // 500 − 100
        Db.Set<Contact>().Single(c => c.Id == contact.Data.Id).OutstandingBalance.Should().Be(8400m);

        var tb = await new GetTrialBalanceHandler(Db, TenantService).Handle(new GetTrialBalanceQuery(), CancellationToken.None);
        tb.Data!.IsBalanced.Should().BeTrue();
    }
}
