using FluentAssertions;
using Xorva.Core.Constants;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Contacts.Commands.CreateContact;
using Xorva.Modules.Accounting.Contacts.Entities;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Commands.SeedChartOfAccounts;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Modules.Accounting.Ledger.Queries.GetTrialBalance;
using Xorva.Modules.Accounting.Sales.Commands.CreateInvoice;
using Xorva.Modules.Accounting.Sales.Commands.PostInvoice;
using Xorva.Modules.Accounting.Sales.Commands.VoidInvoice;
using Xorva.Modules.Accounting.Sales.Entities;
using Xorva.Modules.Accounting.Tax.Commands.SeedTaxRates;
using Xorva.Modules.Accounting.Tax.Entities;
using Xorva.Tests.Unit.TestHelpers;

namespace Xorva.Tests.Unit.Accounting;

public class InvoicePostingTests : AuthHandlerTestBase
{
    private readonly Company _company;
    private static readonly DateTime When = new(2026, 2, 10);

    public InvoicePostingTests()
    {
        var tenant = SeedTenant();
        _company = SeedCompany(tenant.Id, "Invoice Co");
        _company.ActiveModules = [ModuleCatalog.Sales, ModuleCatalog.Accounting];
        Db.SaveChanges();
        ActAs(SeedUser("inv@co.test", role: SystemRole.CompanyAdmin, tenantId: tenant.Id, companyId: _company.Id));
    }

    private JournalPoster Poster => new(Db, TenantService);

    private async Task<(Guid contactId, Guid taxRateId)> Bootstrap()
    {
        await new SeedChartOfAccountsHandler(Db, TenantService)
            .Handle(new SeedChartOfAccountsCommand { Industry = "General" }, CancellationToken.None);
        await new SeedTaxRatesHandler(Db, TenantService)
            .Handle(new SeedTaxRatesCommand(), CancellationToken.None);

        var contact = await new CreateContactHandler(Db, TenantService).Handle(new CreateContactCommand
        {
            Code = "CUST-1", Name = "Blue Sky LLC", ContactType = ContactType.Customer, TaxNumber = "100000000000003",
        }, CancellationToken.None);

        var vat5 = Db.Set<TaxRate>().First(t => t.Rate == 5m).Id;
        return (contact.Data!.Id, vat5);
    }

    private Guid Acct(string code) => Db.Set<Account>().Single(a => a.Code == code).Id;

    [Fact]
    public async Task Post_Invoice_ProducesExactRecipe_AndTrialBalanceStillBalances()
    {
        var (contactId, vat5) = await Bootstrap();

        var created = await new CreateInvoiceHandler(Db, TenantService).Handle(new CreateInvoiceCommand
        {
            ContactId = contactId,
            Date = When,
            Lines = [new() { Description = "Consulting", Quantity = 1, UnitPrice = 10000, TaxRateId = vat5 }],
        }, CancellationToken.None);

        created.Data!.SubTotal.Should().Be(10000m);
        created.Data.TaxTotal.Should().Be(500m);
        created.Data.Total.Should().Be(10500m);
        created.Data.Status.Should().Be("Draft");
        created.Data.Number.Should().StartWith("INV-2026-");

        var posted = await new PostInvoiceHandler(Db, TenantService, Poster)
            .Handle(new PostInvoiceCommand { Id = created.Data.Id }, CancellationToken.None);
        posted.Data!.Status.Should().Be("Posted");
        posted.Data.JournalEntryId.Should().NotBeNull();

        // Recipe: DR AR 10,500 · CR Sales 10,000 · CR VAT-Output 500
        Db.Set<Account>().Single(a => a.Id == Acct(ChartTemplates.Codes.AccountsReceivable)).CurrentBalance.Should().Be(10500m);
        Db.Set<Account>().Single(a => a.Id == Acct(ChartTemplates.Codes.Sales)).CurrentBalance.Should().Be(10000m);
        Db.Set<Account>().Single(a => a.Id == Acct(ChartTemplates.Codes.VatOutput)).CurrentBalance.Should().Be(500m);

        // Customer now owes us the total.
        Db.Set<Contact>().Single(c => c.Id == contactId).OutstandingBalance.Should().Be(10500m);

        var tb = await new GetTrialBalanceHandler(Db, TenantService).Handle(new GetTrialBalanceQuery(), CancellationToken.None);
        tb.Data!.IsBalanced.Should().BeTrue();
        tb.Data.TotalDebit.Should().Be(10500m);
    }

    [Fact]
    public async Task Post_Twice_IsRejected()
    {
        var (contactId, vat5) = await Bootstrap();
        var created = await new CreateInvoiceHandler(Db, TenantService).Handle(new CreateInvoiceCommand
        {
            ContactId = contactId, Date = When,
            Lines = [new() { Description = "X", Quantity = 1, UnitPrice = 100, TaxRateId = vat5 }],
        }, CancellationToken.None);

        var post = new PostInvoiceHandler(Db, TenantService, Poster);
        await post.Handle(new PostInvoiceCommand { Id = created.Data!.Id }, CancellationToken.None);

        var act = () => post.Handle(new PostInvoiceCommand { Id = created.Data.Id }, CancellationToken.None);
        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task Void_PostedInvoice_ReversesJournal_AndClearsBalance()
    {
        var (contactId, vat5) = await Bootstrap();
        var created = await new CreateInvoiceHandler(Db, TenantService).Handle(new CreateInvoiceCommand
        {
            ContactId = contactId, Date = When,
            Lines = [new() { Description = "Y", Quantity = 2, UnitPrice = 500, TaxRateId = vat5 }],
        }, CancellationToken.None);
        await new PostInvoiceHandler(Db, TenantService, Poster)
            .Handle(new PostInvoiceCommand { Id = created.Data!.Id }, CancellationToken.None);

        var voided = await new VoidInvoiceHandler(Db, TenantService, Poster)
            .Handle(new VoidInvoiceCommand { Id = created.Data.Id, Reason = "duplicate" }, CancellationToken.None);

        voided.Data!.Status.Should().Be("Voided");
        Db.Set<Account>().Single(a => a.Id == Acct(ChartTemplates.Codes.AccountsReceivable)).CurrentBalance.Should().Be(0m);
        Db.Set<Contact>().Single(c => c.Id == contactId).OutstandingBalance.Should().Be(0m);

        var tb = await new GetTrialBalanceHandler(Db, TenantService).Handle(new GetTrialBalanceQuery(), CancellationToken.None);
        tb.Data!.Rows.Should().BeEmpty(); // everything nets to zero
    }
}
