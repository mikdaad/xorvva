using FluentAssertions;
using Xorva.Core.Constants;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Modules.Accounting.Banking.Commands.CreateBankAccount;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Contacts.Commands.CreateContact;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Commands.SeedChartOfAccounts;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Modules.Accounting.Sales.Commands.CreateInvoice;
using Xorva.Modules.Accounting.Sales.Commands.PostInvoice;
using Xorva.Modules.Accounting.Sales.Commands.RecordCustomerPayment;
using Xorva.Modules.Accounting.Sales.Entities;
using Xorva.Modules.Accounting.Tax.Commands.SeedTaxRates;
using Xorva.Tests.Unit.TestHelpers;

namespace Xorva.Tests.Unit.Accounting;

public class CustomerPaymentTests : AuthHandlerTestBase
{
    private readonly Company _company;
    private static readonly DateTime When = new(2026, 3, 5);

    public CustomerPaymentTests()
    {
        var tenant = SeedTenant();
        _company = SeedCompany(tenant.Id, "Pay Co");
        _company.ActiveModules = [ModuleCatalog.Sales, ModuleCatalog.Accounting];
        Db.SaveChanges();
        ActAs(SeedUser("pay@co.test", role: SystemRole.CompanyAdmin, tenantId: tenant.Id, companyId: _company.Id));
    }

    private JournalPoster Poster => new(Db, TenantService);
    private Guid Acct(string code) => Db.Set<Account>().Single(a => a.Code == code).Id;

    private async Task<(Guid contactId, Guid bankId, Guid invoiceId)> BootstrapWithPostedInvoice(decimal unitPrice)
    {
        await new SeedChartOfAccountsHandler(Db, TenantService).Handle(new SeedChartOfAccountsCommand { Industry = "General" }, CancellationToken.None);
        await new SeedTaxRatesHandler(Db, TenantService).Handle(new SeedTaxRatesCommand(), CancellationToken.None);

        var contact = await new CreateContactHandler(Db, TenantService).Handle(new CreateContactCommand
        { Code = "C1", Name = "Payer LLC", ContactType = ContactType.Customer }, CancellationToken.None);

        var bank = await new CreateBankAccountHandler(Db, TenantService).Handle(new CreateBankAccountCommand
        { Name = "Main Bank", AccountId = Acct(ChartTemplates.Codes.Bank) }, CancellationToken.None);

        var inv = await new CreateInvoiceHandler(Db, TenantService).Handle(new CreateInvoiceCommand
        {
            ContactId = contact.Data!.Id, Date = When,
            Lines = [new() { Description = "Item", Quantity = 1, UnitPrice = unitPrice }], // no tax → round numbers
        }, CancellationToken.None);
        await new PostInvoiceHandler(Db, TenantService, Poster).Handle(new PostInvoiceCommand { Id = inv.Data!.Id }, CancellationToken.None);

        return (contact.Data.Id, bank.Data!.Id, inv.Data.Id);
    }

    private RecordCustomerPaymentHandler PayHandler => new(Db, TenantService, Poster);

    [Fact]
    public async Task FullPayment_SettlesInvoice_AndMovesCashToBank()
    {
        var (contactId, bankId, invoiceId) = await BootstrapWithPostedInvoice(1000m);

        await PayHandler.Handle(new RecordCustomerPaymentCommand
        {
            ContactId = contactId, BankAccountId = bankId, Date = When, Method = PaymentMethod.Bank,
            Allocations = [new() { InvoiceId = invoiceId, Amount = 1000m }],
        }, CancellationToken.None);

        var inv = Db.Set<Invoice>().Single(i => i.Id == invoiceId);
        inv.Status.Should().Be(DocumentStatus.Paid);
        inv.BalanceDue.Should().Be(0m);
        Db.Set<Account>().Single(a => a.Id == Acct(ChartTemplates.Codes.Bank)).CurrentBalance.Should().Be(1000m);
        Db.Set<Account>().Single(a => a.Id == Acct(ChartTemplates.Codes.AccountsReceivable)).CurrentBalance.Should().Be(0m);
    }

    [Fact]
    public async Task PartialPayment_MarksPartiallyPaid()
    {
        var (contactId, bankId, invoiceId) = await BootstrapWithPostedInvoice(1000m);

        await PayHandler.Handle(new RecordCustomerPaymentCommand
        {
            ContactId = contactId, BankAccountId = bankId, Date = When, Method = PaymentMethod.Bank,
            Allocations = [new() { InvoiceId = invoiceId, Amount = 400m }],
        }, CancellationToken.None);

        var inv = Db.Set<Invoice>().Single(i => i.Id == invoiceId);
        inv.Status.Should().Be(DocumentStatus.PartiallyPaid);
        inv.BalanceDue.Should().Be(600m);
    }

    [Fact]
    public async Task OverAllocation_IsRejected()
    {
        var (contactId, bankId, invoiceId) = await BootstrapWithPostedInvoice(1000m);

        var act = () => PayHandler.Handle(new RecordCustomerPaymentCommand
        {
            ContactId = contactId, BankAccountId = bankId, Date = When, Method = PaymentMethod.Bank,
            Allocations = [new() { InvoiceId = invoiceId, Amount = 1500m }],
        }, CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>();
    }
}
