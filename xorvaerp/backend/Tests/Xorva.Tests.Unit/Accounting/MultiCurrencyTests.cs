using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Constants;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Modules.Accounting.Banking.Commands.CreateBankAccount;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Contacts.Commands.CreateContact;
using Xorva.Modules.Accounting.Contacts.Entities;
using Xorva.Modules.Accounting.Currency.Commands.RunFxRevaluation;
using Xorva.Modules.Accounting.Currency.Commands.UpsertExchangeRate;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Commands.CreateManualJournal;
using Xorva.Modules.Accounting.Ledger.Commands.SeedChartOfAccounts;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Modules.Accounting.Ledger.Queries.GetTrialBalance;
using Xorva.Modules.Accounting.Purchases.Commands.CreateBill;
using Xorva.Modules.Accounting.Purchases.Commands.PostBill;
using Xorva.Modules.Accounting.Purchases.Commands.RecordSupplierPayment;
using Xorva.Modules.Accounting.Sales.Commands.CreateInvoice;
using Xorva.Modules.Accounting.Sales.Commands.PostInvoice;
using Xorva.Modules.Accounting.Sales.Commands.RecordCustomerPayment;
using Xorva.Modules.Accounting.Tax.Commands.SeedTaxRates;
using Xorva.Modules.Accounting.Tax.Entities;
using Xorva.Tests.Unit.TestHelpers;

namespace Xorva.Tests.Unit.Accounting;

/// <summary>
/// E7 — multi-currency. Foreign documents keep transaction-currency amounts but post to the
/// ledger in BASE currency at the document's rate; settling later at a different rate books a
/// realized FX gain/loss. Base-currency behavior is unchanged (see InvoicePostingTests etc).
/// </summary>
public class MultiCurrencyTests : AuthHandlerTestBase
{
    private readonly Company _company;
    private static readonly DateTime When = new(2026, 6, 1);

    public MultiCurrencyTests()
    {
        var tenant = SeedTenant();
        _company = SeedCompany(tenant.Id, "FX Co");
        _company.ActiveModules = [ModuleCatalog.Sales, ModuleCatalog.Accounting];
        Db.SaveChanges();
        ActAs(SeedUser("fx@co.test", role: SystemRole.CompanyAdmin, tenantId: tenant.Id, companyId: _company.Id));
        new SeedChartOfAccountsHandler(Db, TenantService)
            .Handle(new SeedChartOfAccountsCommand { Industry = "General" }, CancellationToken.None).GetAwaiter().GetResult();
        new SeedTaxRatesHandler(Db, TenantService)
            .Handle(new SeedTaxRatesCommand(), CancellationToken.None).GetAwaiter().GetResult();
    }

    private JournalPoster Poster => new(Db, TenantService);
    private decimal Bal(string code) => Db.Set<Account>().Single(a => a.Code == code).CurrentBalance;
    private Guid AcctId(string code) => Db.Set<Account>().Single(a => a.Code == code).Id;

    private Task Rate(decimal rate, DateTime? on = null) =>
        new UpsertExchangeRateHandler(Db, TenantService)
            .Handle(new UpsertExchangeRateCommand { CurrencyCode = "USD", RateDate = on ?? When, Rate = rate }, CancellationToken.None);

    private async Task<Guid> Customer(string code = "CUST-USD") =>
        (await new CreateContactHandler(Db, TenantService)
            .Handle(new CreateContactCommand { Code = code, Name = "US Buyer", ContactType = ContactType.Customer }, CancellationToken.None)).Data!.Id;

    private async Task<Guid> Supplier(string code = "SUP-USD") =>
        (await new CreateContactHandler(Db, TenantService)
            .Handle(new CreateContactCommand { Code = code, Name = "US Vendor", ContactType = ContactType.Supplier }, CancellationToken.None)).Data!.Id;

    private async Task<Guid> BankId() =>
        (await new CreateBankAccountHandler(Db, TenantService)
            .Handle(new CreateBankAccountCommand { Name = "Main", AccountId = Db.Set<Account>().Single(a => a.Code == ChartTemplates.Codes.Bank).Id }, CancellationToken.None)).Data!.Id;

    /// <summary>Posts a USD invoice (no tax) of the given USD amount; returns its id + base value.</summary>
    private async Task<Guid> PostUsdInvoice(Guid customerId, decimal usdAmount)
    {
        var created = await new CreateInvoiceHandler(Db, TenantService).Handle(new CreateInvoiceCommand
        {
            ContactId = customerId, Date = When, Currency = "USD",
            Lines = [new() { Description = "Export", Quantity = 1, UnitPrice = usdAmount }],
        }, CancellationToken.None);
        await new PostInvoiceHandler(Db, TenantService, Poster)
            .Handle(new PostInvoiceCommand { Id = created.Data!.Id }, CancellationToken.None);
        return created.Data.Id;
    }

    [Fact]
    public async Task ForeignInvoice_PostsLedgerInBaseCurrency_AtResolvedRate()
    {
        await Rate(3.00m);
        var vat5 = Db.Set<TaxRate>().First(t => t.Rate == 5m).Id;
        var customerId = await Customer();

        // USD 1,000 + 5% VAT = 1,050 USD @ 3.00 → base 3,150.
        var created = await new CreateInvoiceHandler(Db, TenantService).Handle(new CreateInvoiceCommand
        {
            ContactId = customerId, Date = When, Currency = "USD",
            Lines = [new() { Description = "Consulting", Quantity = 1, UnitPrice = 1000m, TaxRateId = vat5 }],
        }, CancellationToken.None);
        created.Data!.Currency.Should().Be("USD");
        created.Data.ExchangeRate.Should().Be(3.00m);
        created.Data.Total.Should().Be(1050m);   // transaction currency

        var posted = await new PostInvoiceHandler(Db, TenantService, Poster)
            .Handle(new PostInvoiceCommand { Id = created.Data.Id }, CancellationToken.None);
        posted.Data!.BaseTotal.Should().Be(3150m);

        Bal(ChartTemplates.Codes.AccountsReceivable).Should().Be(3150m);
        Bal(ChartTemplates.Codes.Sales).Should().Be(3000m);
        Bal(ChartTemplates.Codes.VatOutput).Should().Be(150m);
        Db.Set<Contact>().Single(c => c.Id == customerId).OutstandingBalance.Should().Be(3150m); // base

        var tb = await new GetTrialBalanceHandler(Db, TenantService).Handle(new GetTrialBalanceQuery(), CancellationToken.None);
        tb.Data!.IsBalanced.Should().BeTrue();
    }

    [Fact]
    public async Task CustomerPayment_AtHigherRate_BooksRealizedFxGain()
    {
        await Rate(3.00m);
        var customerId = await Customer();
        var invId = await PostUsdInvoice(customerId, 1000m);   // base AR 3,000
        var bankId = await BankId();

        // Paid USD 1,000 when the rate is 3.20 → base cash 3,200; AR relieved 3,000 → gain 200.
        await new RecordCustomerPaymentHandler(Db, TenantService, Poster).Handle(new RecordCustomerPaymentCommand
        {
            ContactId = customerId, Date = When.AddMonths(1), BankAccountId = bankId, Method = PaymentMethod.Bank,
            Currency = "USD", ExchangeRate = 3.20m,
            Allocations = [new() { InvoiceId = invId, Amount = 1000m }],
        }, CancellationToken.None);

        Bal(ChartTemplates.Codes.Bank).Should().Be(3200m);
        Bal(ChartTemplates.Codes.AccountsReceivable).Should().Be(0m);
        Bal(ChartTemplates.Codes.ForexGainLoss).Should().Be(200m);   // credit = gain
        Db.Set<Contact>().Single(c => c.Id == customerId).OutstandingBalance.Should().Be(0m);

        var tb = await new GetTrialBalanceHandler(Db, TenantService).Handle(new GetTrialBalanceQuery(), CancellationToken.None);
        tb.Data!.IsBalanced.Should().BeTrue();
    }

    [Fact]
    public async Task CustomerPayment_AtLowerRate_BooksRealizedFxLoss()
    {
        await Rate(3.00m);
        var customerId = await Customer();
        var invId = await PostUsdInvoice(customerId, 1000m);   // base AR 3,000
        var bankId = await BankId();

        // Paid USD 1,000 when the rate is 2.90 → base cash 2,900; AR relieved 3,000 → loss 100.
        await new RecordCustomerPaymentHandler(Db, TenantService, Poster).Handle(new RecordCustomerPaymentCommand
        {
            ContactId = customerId, Date = When.AddMonths(1), BankAccountId = bankId, Method = PaymentMethod.Bank,
            Currency = "USD", ExchangeRate = 2.90m,
            Allocations = [new() { InvoiceId = invId, Amount = 1000m }],
        }, CancellationToken.None);

        Bal(ChartTemplates.Codes.Bank).Should().Be(2900m);
        Bal(ChartTemplates.Codes.AccountsReceivable).Should().Be(0m);
        Bal(ChartTemplates.Codes.ForexGainLoss).Should().Be(-100m);  // debit = loss

        var tb = await new GetTrialBalanceHandler(Db, TenantService).Handle(new GetTrialBalanceQuery(), CancellationToken.None);
        tb.Data!.IsBalanced.Should().BeTrue();
    }

    [Fact]
    public async Task SupplierPayment_AtLowerRate_BooksRealizedFxGain()
    {
        await Rate(3.00m);
        var supplierId = await Supplier();
        var created = await new CreateBillHandler(Db, TenantService).Handle(new CreateBillCommand
        {
            ContactId = supplierId, Date = When, Currency = "USD",
            Lines = [new() { Description = "Import", Quantity = 1, UnitPrice = 1000m }],
        }, CancellationToken.None);
        await new PostBillHandler(Db, TenantService, Poster)
            .Handle(new PostBillCommand { Id = created.Data!.Id }, CancellationToken.None);
        Bal(ChartTemplates.Codes.AccountsPayable).Should().Be(3000m);

        var bankId = await BankId();
        // Paid USD 1,000 at 2.90 → base cash 2,900; AP relieved 3,000 → settled cheaper → gain 100.
        await new RecordSupplierPaymentHandler(Db, TenantService, Poster).Handle(new RecordSupplierPaymentCommand
        {
            ContactId = supplierId, Date = When.AddMonths(1), BankAccountId = bankId, Method = PaymentMethod.Bank,
            Currency = "USD", ExchangeRate = 2.90m,
            Allocations = [new() { BillId = created.Data.Id, Amount = 1000m }],
        }, CancellationToken.None);

        Bal(ChartTemplates.Codes.AccountsPayable).Should().Be(0m);
        Bal(ChartTemplates.Codes.Bank).Should().Be(-2900m);          // cash out
        Bal(ChartTemplates.Codes.ForexGainLoss).Should().Be(100m);   // credit = gain

        var tb = await new GetTrialBalanceHandler(Db, TenantService).Handle(new GetTrialBalanceQuery(), CancellationToken.None);
        tb.Data!.IsBalanced.Should().BeTrue();
    }

    [Fact]
    public async Task PaymentCurrency_MustMatchInvoiceCurrency()
    {
        await Rate(3.00m);
        var customerId = await Customer();
        var invId = await PostUsdInvoice(customerId, 1000m);
        var bankId = await BankId();

        // Try to settle a USD invoice with an AED payment → rejected.
        var act = () => new RecordCustomerPaymentHandler(Db, TenantService, Poster).Handle(new RecordCustomerPaymentCommand
        {
            ContactId = customerId, Date = When.AddMonths(1), BankAccountId = bankId, Method = PaymentMethod.Bank,
            Currency = "AED",
            Allocations = [new() { InvoiceId = invId, Amount = 1000m }],
        }, CancellationToken.None);
        await act.Should().ThrowAsync<Xorva.Core.Exceptions.BadRequestException>();
    }

    // ─── E7 increment 2: unrealized revaluation + FX manual journals ──

    [Fact]
    public async Task Revaluation_OfOpenForeignInvoice_PostsUnrealizedGain_ThatReverses()
    {
        await Rate(3.00m);                              // invoice-date rate
        var customerId = await Customer();
        await PostUsdInvoice(customerId, 1000m);        // open AR: 1,000 USD carried at base 3,000

        var periodEnd = new DateTime(2026, 6, 30);
        await Rate(3.20m, periodEnd);                   // rate risen by period end → unrealized gain

        var res = await new RunFxRevaluationHandler(Db, TenantService, Poster)
            .Handle(new RunFxRevaluationCommand { AsOfDate = periodEnd }, CancellationToken.None);

        res.Data!.Posted.Should().BeTrue();
        res.Data.NetUnrealized.Should().Be(200m);       // 1,000 × (3.20 − 3.00)

        // The as-of entry books DR AR 200 / CR Unrealized FX 200 …
        var entry = await Db.Set<JournalEntry>().Include(e => e.Lines).FirstAsync(e => e.Id == res.Data.JournalEntryId);
        entry.SourceType.Should().Be(JournalSourceType.Fx);
        entry.Lines.Single(l => l.AccountId == AcctId(ChartTemplates.Codes.AccountsReceivable)).Debit.Should().Be(200m);
        entry.Lines.Single(l => l.AccountId == AcctId(ChartTemplates.Codes.UnrealizedForexGainLoss)).Credit.Should().Be(200m);

        // … and it auto-reverses the next day, so cumulative balances net back to zero effect.
        res.Data.ReversalEntryId.Should().NotBeNull();
        Bal(ChartTemplates.Codes.UnrealizedForexGainLoss).Should().Be(0m);
        Bal(ChartTemplates.Codes.AccountsReceivable).Should().Be(3000m);

        var tb = await new GetTrialBalanceHandler(Db, TenantService).Handle(new GetTrialBalanceQuery(), CancellationToken.None);
        tb.Data!.IsBalanced.Should().BeTrue();
    }

    [Fact]
    public async Task Revaluation_OfOpenForeignBill_PostsUnrealizedLoss()
    {
        await Rate(3.00m);
        var supplierId = await Supplier();
        var bill = await new CreateBillHandler(Db, TenantService).Handle(new CreateBillCommand
        {
            ContactId = supplierId, Date = When, Currency = "USD",
            Lines = [new() { Description = "Import", Quantity = 1, UnitPrice = 1000m }],
        }, CancellationToken.None);
        await new PostBillHandler(Db, TenantService, Poster)
            .Handle(new PostBillCommand { Id = bill.Data!.Id }, CancellationToken.None);

        var periodEnd = new DateTime(2026, 6, 30);
        await Rate(3.20m, periodEnd);                   // liability grew in base → unrealized loss

        var res = await new RunFxRevaluationHandler(Db, TenantService, Poster)
            .Handle(new RunFxRevaluationCommand { AsOfDate = periodEnd }, CancellationToken.None);

        res.Data!.NetUnrealized.Should().Be(-200m);
        var entry = await Db.Set<JournalEntry>().Include(e => e.Lines).FirstAsync(e => e.Id == res.Data.JournalEntryId);
        entry.Lines.Single(l => l.AccountId == AcctId(ChartTemplates.Codes.AccountsPayable)).Credit.Should().Be(200m);
        entry.Lines.Single(l => l.AccountId == AcctId(ChartTemplates.Codes.UnrealizedForexGainLoss)).Debit.Should().Be(200m);
    }

    [Fact]
    public async Task Revaluation_WithNoOpenForeignBalances_PostsNothing()
    {
        var res = await new RunFxRevaluationHandler(Db, TenantService, Poster)
            .Handle(new RunFxRevaluationCommand { AsOfDate = new DateTime(2026, 6, 30) }, CancellationToken.None);
        res.Data!.Posted.Should().BeFalse();
        res.Data.NetUnrealized.Should().Be(0m);
    }

    [Fact]
    public async Task Revaluation_IsRejected_WhenAlreadyRunForTheDate()
    {
        await Rate(3.00m);
        var customerId = await Customer();
        await PostUsdInvoice(customerId, 1000m);
        var periodEnd = new DateTime(2026, 6, 30);
        await Rate(3.20m, periodEnd);

        await new RunFxRevaluationHandler(Db, TenantService, Poster)
            .Handle(new RunFxRevaluationCommand { AsOfDate = periodEnd }, CancellationToken.None);

        var act = () => new RunFxRevaluationHandler(Db, TenantService, Poster)
            .Handle(new RunFxRevaluationCommand { AsOfDate = periodEnd }, CancellationToken.None);
        await act.Should().ThrowAsync<Xorva.Core.Exceptions.BadRequestException>();
    }

    [Fact]
    public async Task ForeignManualJournal_PostsLedgerInBaseCurrency()
    {
        await Rate(3.00m);
        // A USD journal DR Bank 1,000 / CR Sales 1,000 → base 3,000 each.
        var res = await new CreateManualJournalHandler(Db, TenantService, Poster).Handle(new CreateManualJournalCommand
        {
            Date = When, Description = "USD entry", Currency = "USD",
            Lines =
            [
                new() { AccountId = AcctId(ChartTemplates.Codes.Bank), Debit = 1000m },
                new() { AccountId = AcctId(ChartTemplates.Codes.Sales), Credit = 1000m },
            ],
        }, CancellationToken.None);

        res.Data!.TotalDebit.Should().Be(3000m);
        Bal(ChartTemplates.Codes.Bank).Should().Be(3000m);
        Bal(ChartTemplates.Codes.Sales).Should().Be(3000m);
    }
}
