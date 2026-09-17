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
using Xorva.Modules.Accounting.Purchases.Commands.CreateBill;
using Xorva.Modules.Accounting.Purchases.Commands.CreateDebitNote;
using Xorva.Modules.Accounting.Purchases.Commands.PostBill;
using Xorva.Modules.Accounting.Tax.Commands.SeedTaxRates;
using Xorva.Modules.Accounting.Tax.Entities;
using Xorva.Tests.Unit.TestHelpers;

namespace Xorva.Tests.Unit.Accounting;

public class DebitNoteTests : AuthHandlerTestBase
{
    private readonly Company _company;
    private static readonly DateTime When = new(2026, 8, 4);

    public DebitNoteTests()
    {
        var tenant = SeedTenant();
        _company = SeedCompany(tenant.Id, "DN Co");
        _company.ActiveModules = [ModuleCatalog.Sales, ModuleCatalog.Accounting];
        Db.SaveChanges();
        ActAs(SeedUser("dn@co.test", role: SystemRole.CompanyAdmin, tenantId: tenant.Id, companyId: _company.Id));
    }

    private JournalPoster Poster => new(Db, TenantService);
    private Guid Acct(string code) => Db.Set<Account>().Single(a => a.Code == code).Id;

    [Fact]
    public async Task DebitNote_ReversesExpenseInputVatAndPayable()
    {
        await new SeedChartOfAccountsHandler(Db, TenantService).Handle(new SeedChartOfAccountsCommand { Industry = "General" }, CancellationToken.None);
        await new SeedTaxRatesHandler(Db, TenantService).Handle(new SeedTaxRatesCommand(), CancellationToken.None);
        var supplier = await new CreateContactHandler(Db, TenantService).Handle(new CreateContactCommand
        { Code = "S1", Name = "Supplier", ContactType = ContactType.Supplier }, CancellationToken.None);
        var vat5 = Db.Set<TaxRate>().First(t => t.Rate == 5m).Id;

        // Bill 2,000 + 5% VAT → AP 2,100.
        var bill = await new CreateBillHandler(Db, TenantService).Handle(new CreateBillCommand
        {
            ContactId = supplier.Data!.Id, Date = When,
            Lines = [new() { Description = "Supplies", Quantity = 1, UnitPrice = 2000, TaxRateId = vat5 }],
        }, CancellationToken.None);
        await new PostBillHandler(Db, TenantService, Poster).Handle(new PostBillCommand { Id = bill.Data!.Id }, CancellationToken.None);

        // Debit note 500 + 5% VAT = 525.
        var dn = await new CreateDebitNoteHandler(Db, TenantService, Poster).Handle(new CreateDebitNoteCommand
        {
            ContactId = supplier.Data.Id, BillId = bill.Data.Id, Date = When, Reason = "returned",
            Lines = [new() { Description = "Return", Quantity = 1, UnitPrice = 500, TaxRateId = vat5 }],
        }, CancellationToken.None);

        dn.Data!.Total.Should().Be(525m);
        dn.Data.Number.Should().StartWith("DN-2026-");

        Db.Set<Account>().Single(a => a.Id == Acct(ChartTemplates.Codes.AccountsPayable)).CurrentBalance.Should().Be(1575m); // 2,100 − 525
        Db.Set<Account>().Single(a => a.Id == Acct(ChartTemplates.Codes.Cogs)).CurrentBalance.Should().Be(1500m);           // 2,000 − 500
        Db.Set<Account>().Single(a => a.Id == Acct(ChartTemplates.Codes.VatInput)).CurrentBalance.Should().Be(75m);          // 100 − 25
        Db.Set<Contact>().Single(c => c.Id == supplier.Data.Id).OutstandingBalance.Should().Be(1575m);

        var tb = await new GetTrialBalanceHandler(Db, TenantService).Handle(new GetTrialBalanceQuery(), CancellationToken.None);
        tb.Data!.IsBalanced.Should().BeTrue();
    }
}
