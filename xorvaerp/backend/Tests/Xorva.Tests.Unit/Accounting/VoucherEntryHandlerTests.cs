using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Constants;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Contacts.Commands.CreateContact;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Commands.CreateFiscalYear;
using Xorva.Modules.Accounting.Ledger.Commands.SeedChartOfAccounts;
using Xorva.Modules.Accounting.Ledger.Commands.SetFiscalPeriodClosed;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Modules.Accounting.Tax.Commands.SeedTaxRates;
using Xorva.Modules.Accounting.Tax.Entities;
using Xorva.Modules.Accounting.Vouchers.Commands.SaveAndPostVoucher;
using Xorva.Modules.Accounting.Vouchers.Common;
using Xorva.Modules.Accounting.Vouchers.Entities;
using Xorva.Modules.Commerce.Contacts.Common;
using Xorva.Tests.Unit.TestHelpers;

namespace Xorva.Tests.Unit.Accounting;

/// <summary>
/// Handler-level tests for the F4–F9 entry screen: master validation, draft persistence and what
/// gets handed to <c>accounting.post_voucher_atomic</c>. The RPC is faked (SQLite has no plpgsql);
/// the SQL side has its own suite under Xorva.Infrastructure/Sql/Tests.
/// </summary>
public class VoucherEntryHandlerTests : AuthHandlerTestBase
{
    private readonly Company _company;
    private readonly FakeAccountingRpc _rpc = new();
    private static readonly DateOnly When = new(2026, 3, 10);

    public VoucherEntryHandlerTests()
    {
        var tenant = SeedTenant();
        _company = SeedCompany(tenant.Id, "Voucher Co");
        _company.ActiveModules = [ModuleCatalog.Sales, ModuleCatalog.Accounting];
        Db.SaveChanges();
        ActAs(SeedUser("vch@co.test", role: SystemRole.CompanyAdmin, tenantId: tenant.Id, companyId: _company.Id));
        new SeedChartOfAccountsHandler(Db, TenantService)
            .Handle(new SeedChartOfAccountsCommand { Industry = "General" }, CancellationToken.None).GetAwaiter().GetResult();
        new SeedTaxRatesHandler(Db, TenantService)
            .Handle(new SeedTaxRatesCommand(), CancellationToken.None).GetAwaiter().GetResult();
    }

    private SaveAndPostVoucherHandler Handler => new(Db, TenantService, _rpc, new PartyDirectory(Db));
    private Guid Acct(string code) => Db.Set<Account>().Single(a => a.Code == code).Id;
    private Guid Vat5 => Db.Set<TaxRate>().First(t => t.Rate == 5m).Id;

    private async Task<Guid> Customer()
    {
        var r = await new CreateContactHandler(Db, TenantService).Handle(new CreateContactCommand
        {
            Code = "CUST-1", Name = "Blue Sky LLC", ContactType = ContactType.Customer, TaxNumber = "100000000000003",
        }, CancellationToken.None);
        return r.Data!.Id;
    }

    [Fact]
    public async Task Payment_SavesVoucher_AndPostsBalancedLinesThroughRpc()
    {
        var res = await Handler.Handle(new SaveAndPostVoucherCommand
        {
            VoucherType = VoucherType.Payment,
            VoucherDate = When,
            Narration = "Office rent March",
            Lines =
            [
                new() { AccountId = Acct(ChartTemplates.Codes.Rounding), DrCr = "DR", Amount = 1200 },
                new() { AccountId = Acct(ChartTemplates.Codes.Bank), DrCr = "CR", Amount = 1200 },
            ],
        }, CancellationToken.None);

        res.Success.Should().BeTrue();
        res.Data!.VoucherNumber.Should().Be("PV-2026-00001");
        res.Data.TotalAmount.Should().Be(1200m);

        var voucher = await Db.Set<Voucher>().Include(v => v.Lines).SingleAsync();
        voucher.Lines.Should().HaveCount(2);
        voucher.BaseTotalAmount.Should().Be(1200m);
        voucher.Currency.Should().Be("AED");

        _rpc.Posted.Should().ContainSingle();
        var (voucherId, lines) = _rpc.Posted[0];
        voucherId.Should().Be(voucher.Id);
        lines.Sum(l => l.BaseDebit).Should().Be(lines.Sum(l => l.BaseCredit)).And.Be(1200m);
    }

    [Fact]
    public async Task SaveAsDraft_DoesNotCallPost()
    {
        var res = await Handler.Handle(new SaveAndPostVoucherCommand
        {
            VoucherType = VoucherType.Journal, VoucherDate = When, SaveAsDraft = true,
            Lines =
            [
                new() { AccountId = Acct(ChartTemplates.Codes.Cash), DrCr = "DR", Amount = 10 },
                new() { AccountId = Acct(ChartTemplates.Codes.Bank), DrCr = "CR", Amount = 10 },
            ],
        }, CancellationToken.None);

        res.Data!.Status.Should().Be(VoucherStatus.Draft);
        res.Data.VoucherNumber.Should().Be("JV-2026-00001");
        _rpc.Posted.Should().BeEmpty();
    }

    [Fact]
    public async Task Draft_CanBeRepostedInPlace_ReplacingLines_WithoutNewNumber()
    {
        var draft = await Handler.Handle(new SaveAndPostVoucherCommand
        {
            VoucherType = VoucherType.Journal, VoucherDate = When, SaveAsDraft = true,
            Lines =
            [
                new() { AccountId = Acct(ChartTemplates.Codes.Cash), DrCr = "DR", Amount = 10 },
                new() { AccountId = Acct(ChartTemplates.Codes.Bank), DrCr = "CR", Amount = 10 },
            ],
        }, CancellationToken.None);

        var posted = await Handler.Handle(new SaveAndPostVoucherCommand
        {
            VoucherId = draft.Data!.Id,
            VoucherType = VoucherType.Journal, VoucherDate = When,
            Lines =
            [
                new() { AccountId = Acct(ChartTemplates.Codes.Cash), DrCr = "DR", Amount = 25 },
                new() { AccountId = Acct(ChartTemplates.Codes.Sales), DrCr = "CR", Amount = 25 },
            ],
        }, CancellationToken.None);

        posted.Data!.Id.Should().Be(draft.Data.Id);
        posted.Data.VoucherNumber.Should().Be("JV-2026-00001");
        (await Db.Set<VoucherLine>().CountAsync()).Should().Be(2);
        (await Db.Set<Voucher>().CountAsync()).Should().Be(1);
        _rpc.Posted.Should().ContainSingle(p => p.VoucherId == draft.Data.Id);
    }

    [Fact]
    public async Task SalesInvoice_DerivesDueDate_Trns_AndVatLine()
    {
        var customerId = await Customer();
        var res = await Handler.Handle(new SaveAndPostVoucherCommand
        {
            VoucherType = VoucherType.SalesInvoice,
            VoucherDate = When,
            ContactId = customerId,
            Lines = [new() { AccountId = Acct(ChartTemplates.Codes.Sales), Quantity = 2, UnitPrice = 500, TaxRateId = Vat5, Description = "Consulting" }],
        }, CancellationToken.None);

        res.Data!.VoucherNumber.Should().Be("SI-2026-00001");
        res.Data.TotalAmount.Should().Be(1050m);
        res.Data.TaxTotal.Should().Be(50m);
        res.Data.ContactName.Should().Be("Blue Sky LLC");

        var voucher = await Db.Set<Voucher>().SingleAsync();
        voucher.DueDate.Should().NotBeNull();
        voucher.BuyerTrn.Should().Be("100000000000003");
        voucher.PlaceOfSupply.Should().Be("AE");

        var lines = _rpc.Posted.Single().Lines;
        lines.Single(l => l.AccountId == Acct(ChartTemplates.Codes.AccountsReceivable)).BaseDebit.Should().Be(1050m);
        lines.Single(l => l.AccountId == Acct(ChartTemplates.Codes.AccountsReceivable)).ContactId.Should().Be(customerId);
        lines.Single(l => l.AccountId == Acct(ChartTemplates.Codes.VatOutput)).BaseCredit.Should().Be(50m);
    }

    [Fact]
    public async Task SalesInvoice_WithoutCustomer_IsRejected_NothingWritten()
    {
        var act = () => Handler.Handle(new SaveAndPostVoucherCommand
        {
            VoucherType = VoucherType.SalesInvoice, VoucherDate = When,
            Lines = [new() { AccountId = Acct(ChartTemplates.Codes.Sales), Quantity = 1, UnitPrice = 100 }],
        }, CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>().WithMessage("*customer*");
        (await Db.Set<Voucher>().AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task UnknownLedger_IsRejected()
    {
        var act = () => Handler.Handle(new SaveAndPostVoucherCommand
        {
            VoucherType = VoucherType.Journal, VoucherDate = When,
            Lines =
            [
                new() { AccountId = Guid.NewGuid(), DrCr = "DR", Amount = 10 },
                new() { AccountId = Acct(ChartTemplates.Codes.Bank), DrCr = "CR", Amount = 10 },
            ],
        }, CancellationToken.None);
        await act.Should().ThrowAsync<BadRequestException>().WithMessage("*chart of accounts*");
    }

    [Fact]
    public async Task PostFailure_DeletesJustCreatedVoucher_AndRethrows()
    {
        _rpc.PostFailure = new InvalidOperationException("db said no");
        var act = () => Handler.Handle(new SaveAndPostVoucherCommand
        {
            VoucherType = VoucherType.Contra, VoucherDate = When,
            Lines =
            [
                new() { AccountId = Acct(ChartTemplates.Codes.Cash), DrCr = "DR", Amount = 300 },
                new() { AccountId = Acct(ChartTemplates.Codes.Bank), DrCr = "CR", Amount = 300 },
            ],
        }, CancellationToken.None);

        await act.Should().ThrowAsync<InvalidOperationException>().WithMessage("db said no");
        (await Db.Set<Voucher>().AnyAsync()).Should().BeFalse("TrueLedge compensation: no orphan draft");
        (await Db.Set<VoucherLine>().AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task HardClosedPeriod_IsRejectedBeforeWriting()
    {
        var year = await new CreateFiscalYearHandler(Db, TenantService)
            .Handle(new CreateFiscalYearCommand { Year = 2026 }, CancellationToken.None);
        var march = year.Data!.Periods.Single(p => p.StartDate.Month == 3);
        await new SetFiscalPeriodClosedHandler(Db, TenantService)
            .Handle(new SetFiscalPeriodClosedCommand { Id = march.Id, IsClosed = true }, CancellationToken.None);

        var act = () => Handler.Handle(new SaveAndPostVoucherCommand
        {
            VoucherType = VoucherType.Contra, VoucherDate = When,
            Lines =
            [
                new() { AccountId = Acct(ChartTemplates.Codes.Cash), DrCr = "DR", Amount = 300 },
                new() { AccountId = Acct(ChartTemplates.Codes.Bank), DrCr = "CR", Amount = 300 },
            ],
        }, CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>().WithMessage("*closed*");
        (await Db.Set<Voucher>().AnyAsync()).Should().BeFalse();
        _rpc.Posted.Should().BeEmpty();
    }

    [Fact]
    public async Task SoftClosedPeriod_AllowsCompanyAdmin_ButBlocksManager()
    {
        var year = await new CreateFiscalYearHandler(Db, TenantService)
            .Handle(new CreateFiscalYearCommand { Year = 2026 }, CancellationToken.None);
        var march = year.Data!.Periods.Single(p => p.StartDate.Month == 3);
        await new SetFiscalPeriodClosedHandler(Db, TenantService)
            .Handle(new SetFiscalPeriodClosedCommand { Id = march.Id, CloseStatus = PeriodCloseStatus.SoftClosed }, CancellationToken.None);

        SaveAndPostVoucherCommand Cmd() => new()
        {
            VoucherType = VoucherType.Contra, VoucherDate = When,
            Lines =
            [
                new() { AccountId = Acct(ChartTemplates.Codes.Cash), DrCr = "DR", Amount = 300 },
                new() { AccountId = Acct(ChartTemplates.Codes.Bank), DrCr = "CR", Amount = 300 },
            ],
        };

        var ok = await Handler.Handle(Cmd(), CancellationToken.None);   // CompanyAdmin
        ok.Data!.Status.Should().Be(VoucherStatus.Posted);

        ActAs(SeedUser("mgr@co.test", role: SystemRole.Manager, tenantId: _company.TenantId, companyId: _company.Id));
        var act = () => Handler.Handle(Cmd(), CancellationToken.None);
        await act.Should().ThrowAsync<BadRequestException>().WithMessage("*soft-closed*");
    }
}
