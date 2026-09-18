using FluentAssertions;
using Xorva.Core.Exceptions;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Vouchers.Common;

namespace Xorva.Tests.Unit.Accounting;

/// <summary>Pure tests of the F4–F9 maths ported from TrueLedge voucher-entry.ts / voucher.ts.</summary>
public class VoucherEngineTests
{
    private static readonly Guid Bank = Guid.NewGuid(), Cash = Guid.NewGuid(), Rent = Guid.NewGuid(), Sales = Guid.NewGuid();
    private static readonly Guid Ar = Guid.NewGuid(), Ap = Guid.NewGuid(), VatOut = Guid.NewGuid(), VatIn = Guid.NewGuid();
    private static readonly Guid Vat5 = Guid.NewGuid(), Zero = Guid.NewGuid(), Party = Guid.NewGuid();

    private static VoucherContext Ctx(decimal rate = 1m, Guid? control = null, Guid? contact = null) => new()
    {
        BaseCurrency = "AED",
        ExchangeRate = rate,
        TaxRates = new Dictionary<Guid, TaxRateInfo>
        {
            [Vat5] = new(Vat5, 5m, VatOut, VatIn),
            [Zero] = new(Zero, 0m, VatOut, VatIn),
        },
        PartyControlAccountId = control,
        ContactId = contact,
        ControlAccountIds = new HashSet<Guid> { Ar, Ap },
    };

    [Fact]
    public void Contra_TwoLines_BalancedLedger()
    {
        var r = VoucherEngine.Compute(VoucherType.Contra,
        [
            new() { AccountId = Cash, DrCr = "DR", Amount = 500 },
            new() { AccountId = Bank, DrCr = "CR", Amount = 500 },
        ], Ctx());

        r.TotalAmount.Should().Be(500m);
        r.TaxTotal.Should().Be(0m);
        r.LedgerLines.Should().HaveCount(2);
        r.LedgerLines.Sum(l => l.BaseDebit).Should().Be(r.LedgerLines.Sum(l => l.BaseCredit));
        r.Lines.Select(l => l.DrCr).Should().Equal("DR", "CR");
    }

    [Fact]
    public void Journal_Unbalanced_IsRejectedBeforeAnyLedgerLines()
    {
        var act = () => VoucherEngine.Compute(VoucherType.Journal,
        [
            new() { AccountId = Rent, DrCr = "DR", Amount = 100 },
            new() { AccountId = Bank, DrCr = "CR", Amount = 90 },
        ], Ctx());
        act.Should().Throw<BadRequestException>().WithMessage("*not balanced*");
    }

    [Fact]
    public void Journal_ZeroTotal_IsRejected()
    {
        var act = () => VoucherEngine.Compute(VoucherType.Journal,
            [new() { AccountId = Rent, DrCr = "DR", Amount = 0 }], Ctx());
        act.Should().Throw<BadRequestException>();
    }

    [Fact]
    public void Payment_NeedsTwoLedgers()
    {
        var act = () => VoucherEngine.Compute(VoucherType.Payment,
            [new() { AccountId = Rent, DrCr = "DR", Amount = 100 }], Ctx());
        act.Should().Throw<BadRequestException>().WithMessage("*not balanced*");
    }

    [Fact]
    public void Receipt_StampsContactOnlyOnControlAccountLine()
    {
        var r = VoucherEngine.Compute(VoucherType.Receipt,
        [
            new() { AccountId = Bank, DrCr = "DR", Amount = 1050 },
            new() { AccountId = Ar, DrCr = "CR", Amount = 1050 },
        ], Ctx(contact: Party));

        r.LedgerLines.Single(l => l.AccountId == Bank).ContactId.Should().BeNull();
        r.LedgerLines.Single(l => l.AccountId == Ar).ContactId.Should().Be(Party);
    }

    [Fact]
    public void SalesInvoice_ComputesNetTaxTotal_AndBalancingArLine()
    {
        var r = VoucherEngine.Compute(VoucherType.SalesInvoice,
        [
            new() { AccountId = Sales, Quantity = 2, UnitPrice = 100, DiscountPct = 10, TaxRateId = Vat5, Description = "Consulting" },
            new() { AccountId = Sales, Quantity = 1, UnitPrice = 50, TaxRateId = Zero },
        ], Ctx(control: Ar, contact: Party));

        // line 1: 200 − 10% = 180 net, 9 tax; line 2: 50 net, 0 tax
        r.SubTotal.Should().Be(230m);
        r.DiscountTotal.Should().Be(20m);
        r.TaxTotal.Should().Be(9m);
        r.TotalAmount.Should().Be(239m);

        r.Lines.Should().HaveCount(2);
        r.Lines[0].LineAmount.Should().Be(180m);
        r.Lines[0].TaxAmount.Should().Be(9m);
        r.Lines[0].LineTotal.Should().Be(189m);
        r.Lines[0].DrCr.Should().Be("CR");

        // ledger: Cr Sales 180, Cr Sales 50, Cr VAT 9, Dr A/R 239
        r.LedgerLines.Should().HaveCount(4);
        var ar = r.LedgerLines.Single(l => l.AccountId == Ar);
        ar.BaseDebit.Should().Be(239m);
        ar.ContactId.Should().Be(Party);
        r.LedgerLines.Single(l => l.AccountId == VatOut).BaseCredit.Should().Be(9m);
        r.LedgerLines.Sum(l => l.BaseDebit).Should().Be(r.LedgerLines.Sum(l => l.BaseCredit));
    }

    [Fact]
    public void PurchaseBill_UsesInputVatAccount_AndCreditsAp()
    {
        var r = VoucherEngine.Compute(VoucherType.PurchaseBill,
            [new() { AccountId = Rent, Quantity = 1, UnitPrice = 1000, TaxRateId = Vat5 }],
            Ctx(control: Ap, contact: Party));

        r.TotalAmount.Should().Be(1050m);
        r.LedgerLines.Single(l => l.AccountId == Rent).BaseDebit.Should().Be(1000m);
        r.LedgerLines.Single(l => l.AccountId == VatIn).BaseDebit.Should().Be(50m);
        r.LedgerLines.Single(l => l.AccountId == Ap).BaseCredit.Should().Be(1050m);
        r.Lines[0].DrCr.Should().Be("DR");
    }

    [Fact]
    public void Invoice_WithoutParty_IsRejected()
    {
        var act = () => VoucherEngine.Compute(VoucherType.SalesInvoice,
            [new() { AccountId = Sales, Quantity = 1, UnitPrice = 100 }], Ctx(control: Ar));
        act.Should().Throw<BadRequestException>().WithMessage("*customer*");
    }

    [Fact]
    public void Invoice_UnknownTaxRate_IsRejected_ClientRatesNeverTrusted()
    {
        var act = () => VoucherEngine.Compute(VoucherType.SalesInvoice,
            [new() { AccountId = Sales, Quantity = 1, UnitPrice = 100, TaxRateId = Guid.NewGuid() }], Ctx(control: Ar, contact: Party));
        act.Should().Throw<BadRequestException>().WithMessage("*tax rate*");
    }

    [Fact]
    public void Invoice_GroupsVatLinesPerRate()
    {
        var r = VoucherEngine.Compute(VoucherType.SalesInvoice,
        [
            new() { AccountId = Sales, Quantity = 1, UnitPrice = 100, TaxRateId = Vat5 },
            new() { AccountId = Sales, Quantity = 1, UnitPrice = 300, TaxRateId = Vat5 },
        ], Ctx(control: Ar, contact: Party));

        r.LedgerLines.Count(l => l.AccountId == VatOut).Should().Be(1);
        r.LedgerLines.Single(l => l.AccountId == VatOut).BaseCredit.Should().Be(20m);
    }

    [Fact]
    public void ForeignCurrency_PostsBaseAmounts_AndStaysBalancedDespiteRounding()
    {
        // 3 lines × USD 33.33 at 3.6725 → each 122.40 (rounded); total credit computed per line too.
        var r = VoucherEngine.Compute(VoucherType.Journal,
        [
            new() { AccountId = Rent, DrCr = "DR", Amount = 33.33m },
            new() { AccountId = Rent, DrCr = "DR", Amount = 33.33m },
            new() { AccountId = Rent, DrCr = "DR", Amount = 33.34m },
            new() { AccountId = Bank, DrCr = "CR", Amount = 100m },
        ], Ctx(rate: 3.6725m));

        r.TotalAmount.Should().Be(100m);
        r.LedgerLines.Sum(l => l.BaseDebit).Should().Be(r.LedgerLines.Sum(l => l.BaseCredit));
        r.BaseTotalAmount.Should().Be(r.LedgerLines.Sum(l => l.BaseDebit));
        r.Lines.All(l => l.BaseLineTotal == VoucherEngine.Money(l.LineTotal * 3.6725m)).Should().BeTrue();
    }

    [Fact]
    public void Catalogue_HasSixEntryTypes_WithSqlPrefixes()
    {
        VoucherTypes.EntryTypes.Select(t => t.Shortcut).Should().Equal("F4", "F5", "F6", "F7", "F8", "F9");
        VoucherTypes.For(VoucherType.SalesInvoice).Prefix.Should().Be("SI");
        VoucherTypes.For(VoucherType.Contra).Prefix.Should().Be("CT");
        VoucherTypes.For(VoucherType.PurchaseBill).RequiresParty.Should().BeTrue();
        VoucherTypes.For(VoucherType.Journal).Mode.Should().Be(VoucherMode.Journal);
    }
}
