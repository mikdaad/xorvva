using FluentAssertions;
using Xorva.Core.Constants;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Modules.Accounting.Banking.Commands.CreateBankAccount;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Contacts.Commands.CreateContact;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Commands.SeedChartOfAccounts;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Modules.Accounting.Purchases.Commands.CreateBill;
using Xorva.Modules.Accounting.Purchases.Commands.PostBill;
using Xorva.Modules.Accounting.Purchases.Commands.RecordSupplierPayment;
using Xorva.Modules.Accounting.Purchases.Entities;
using Xorva.Modules.Accounting.Tax.Commands.SeedTaxRates;
using Xorva.Modules.Accounting.Tax.Entities;
using Xorva.Modules.Accounting.Tax.Queries.GetVatReturn;
using Xorva.Tests.Unit.TestHelpers;

namespace Xorva.Tests.Unit.Accounting;

public class BillPostingTests : AuthHandlerTestBase
{
    private readonly Company _company;
    private static readonly DateTime When = new(2026, 5, 8);

    public BillPostingTests()
    {
        var tenant = SeedTenant();
        _company = SeedCompany(tenant.Id, "Buy Co");
        _company.ActiveModules = [ModuleCatalog.Sales, ModuleCatalog.Accounting];
        Db.SaveChanges();
        ActAs(SeedUser("buy@co.test", role: SystemRole.CompanyAdmin, tenantId: tenant.Id, companyId: _company.Id));
    }

    private JournalPoster Poster => new(Db, TenantService);
    private Guid Acct(string code) => Db.Set<Account>().Single(a => a.Code == code).Id;

    private async Task<(Guid supplierId, Guid vat5, Guid bankId)> Bootstrap()
    {
        await new SeedChartOfAccountsHandler(Db, TenantService).Handle(new SeedChartOfAccountsCommand { Industry = "General" }, CancellationToken.None);
        await new SeedTaxRatesHandler(Db, TenantService).Handle(new SeedTaxRatesCommand(), CancellationToken.None);
        var supplier = await new CreateContactHandler(Db, TenantService).Handle(new CreateContactCommand
        { Code = "S1", Name = "Supplier LLC", ContactType = ContactType.Supplier }, CancellationToken.None);
        var bank = await new CreateBankAccountHandler(Db, TenantService).Handle(new CreateBankAccountCommand
        { Name = "Main", AccountId = Acct(ChartTemplates.Codes.Bank) }, CancellationToken.None);
        var vat5 = Db.Set<TaxRate>().First(t => t.Rate == 5m).Id;
        return (supplier.Data!.Id, vat5, bank.Data!.Id);
    }

    [Fact]
    public async Task Post_Bill_ProducesExactRecipe()
    {
        var (supplierId, vat5, _) = await Bootstrap();

        var bill = await new CreateBillHandler(Db, TenantService).Handle(new CreateBillCommand
        {
            ContactId = supplierId, Date = When,
            Lines = [new() { Description = "Office rent", Quantity = 1, UnitPrice = 2000, TaxRateId = vat5 }],
        }, CancellationToken.None);
        bill.Data!.Total.Should().Be(2100m);

        await new PostBillHandler(Db, TenantService, Poster).Handle(new PostBillCommand { Id = bill.Data.Id }, CancellationToken.None);

        // DR Expense 2,000 · DR VAT-Input 100 · CR Payable 2,100
        Db.Set<Account>().Single(a => a.Id == Acct(ChartTemplates.Codes.Cogs)).CurrentBalance.Should().Be(2000m);
        Db.Set<Account>().Single(a => a.Id == Acct(ChartTemplates.Codes.VatInput)).CurrentBalance.Should().Be(100m);
        Db.Set<Account>().Single(a => a.Id == Acct(ChartTemplates.Codes.AccountsPayable)).CurrentBalance.Should().Be(2100m);
    }

    [Fact]
    public async Task PaySupplier_SettlesBill_AndReducesPayable()
    {
        var (supplierId, _, bankId) = await Bootstrap();
        var bill = await new CreateBillHandler(Db, TenantService).Handle(new CreateBillCommand
        {
            ContactId = supplierId, Date = When,
            Lines = [new() { Description = "Goods", Quantity = 1, UnitPrice = 1000 }], // no tax
        }, CancellationToken.None);
        await new PostBillHandler(Db, TenantService, Poster).Handle(new PostBillCommand { Id = bill.Data!.Id }, CancellationToken.None);

        await new RecordSupplierPaymentHandler(Db, TenantService, Poster).Handle(new RecordSupplierPaymentCommand
        {
            ContactId = supplierId, BankAccountId = bankId, Date = When, Method = PaymentMethod.Bank,
            Allocations = [new() { BillId = bill.Data.Id, Amount = 1000m }],
        }, CancellationToken.None);

        Db.Set<Bill>().Single(b => b.Id == bill.Data.Id).Status.Should().Be(DocumentStatus.Paid);
        Db.Set<Account>().Single(a => a.Id == Acct(ChartTemplates.Codes.AccountsPayable)).CurrentBalance.Should().Be(0m);
        Db.Set<Account>().Single(a => a.Id == Acct(ChartTemplates.Codes.Bank)).CurrentBalance.Should().Be(-1000m); // paid out
    }

    [Fact]
    public async Task VatReturn_NetsOutputMinusInput()
    {
        var (supplierId, vat5, _) = await Bootstrap();
        var bill = await new CreateBillHandler(Db, TenantService).Handle(new CreateBillCommand
        {
            ContactId = supplierId, Date = When,
            Lines = [new() { Description = "Supplies", Quantity = 1, UnitPrice = 2000, TaxRateId = vat5 }],
        }, CancellationToken.None);
        await new PostBillHandler(Db, TenantService, Poster).Handle(new PostBillCommand { Id = bill.Data!.Id }, CancellationToken.None);

        var vat = await new GetVatReturnHandler(Db, TenantService)
            .Handle(new GetVatReturnQuery { From = new DateTime(2026, 1, 1), To = new DateTime(2026, 12, 31) }, CancellationToken.None);

        vat.Data!.OutputVat.Should().Be(0m);
        vat.Data.InputVat.Should().Be(100m);
        vat.Data.NetPayable.Should().Be(-100m); // reclaimable
    }
}
