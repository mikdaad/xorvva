using FluentAssertions;
using Xorva.Modules.Accounting.Banking.Import;

namespace Xorva.Tests.Unit.Accounting;

/// <summary>Port-parity tests for the UAE bank CSV parser (TrueLedge csv-parser.ts).</summary>
public class BankCsvParserTests
{
    [Fact]
    public void ParsesEnbdStyleExport_SkippingBannerRows_AndFooter()
    {
        const string csv = """
            Emirates NBD,,,,
            Account Statement,,,,
            Account No: 1012345678901,,,,
            Date,Description,Reference,Debit,Credit,Balance
            01/02/2026,"SALARY TRANSFER, ACME LLC",TRF001,,"15,000.00","25,000.00"
            03/02/2026,DEWA BILL PAYMENT,DEWA88,"1,234.56",,"23,765.44"
            05-Feb-2026,ATM WITHDRAWAL,,500.00,,"23,265.44"
            Closing Balance,,,,,"23,265.44"
            """;

        var r = BankCsvParser.Parse(csv);

        r.Success.Should().BeTrue();
        r.BankFormat.Should().Be("enbd");
        r.SkippedRows.Should().Be(4);              // 3 banner rows + footer without a date
        r.Lines.Should().HaveCount(3);

        r.Lines[0].LineDate.Should().Be(new DateOnly(2026, 2, 1));
        r.Lines[0].Description.Should().Be("SALARY TRANSFER, ACME LLC");   // comma inside quotes preserved
        r.Lines[0].Credit.Should().Be(15000m);
        r.Lines[0].Debit.Should().Be(0m);
        r.Lines[0].Balance.Should().Be(25000m);
        r.Lines[0].Reference.Should().Be("TRF001");

        r.Lines[1].Debit.Should().Be(1234.56m);
        r.Lines[2].LineDate.Should().Be(new DateOnly(2026, 2, 5));

        r.PeriodFrom.Should().Be(new DateOnly(2026, 2, 1));
        r.PeriodTo.Should().Be(new DateOnly(2026, 2, 5));
        r.TotalDebits.Should().Be(1734.56m);
        r.TotalCredits.Should().Be(15000m);
        r.Lines[0].RawData.Should().ContainKey("Balance");
    }

    [Fact]
    public void SingleSignedAmountColumn_SplitsIntoDebitCredit()
    {
        const string csv = """
            Transaction Date,Details,Reference,Amount
            2026-03-01,Card purchase,X1,-250.00
            2026-03-02,Refund,X2,75.50
            """;
        var r = BankCsvParser.Parse(csv);
        r.Success.Should().BeTrue();
        r.Lines[0].Debit.Should().Be(250m);
        r.Lines[0].Credit.Should().Be(0m);
        r.Lines[1].Credit.Should().Be(75.5m);
    }

    [Fact]
    public void NoHeader_Fails_WithHelpfulError()
    {
        var r = BankCsvParser.Parse("a,b,c,d\n1,2,3,4\n");
        r.Success.Should().BeFalse();
        r.Errors.Should().ContainSingle(e => e.Contains("header row"));
    }

    [Theory]
    [InlineData("(1,234.56)", -1234.56)]
    [InlineData("1,234.56 DR", -1234.56)]
    [InlineData("1,234.56 CR", 1234.56)]
    [InlineData("-99.9", -99.9)]
    [InlineData("AED 1,000", 1000)]
    [InlineData("", 0)]
    [InlineData("-", 0)]
    [InlineData("abc", 0)]
    public void ParseAmount_HandlesBankFormats(string input, double expected)
        => BankCsvParser.ParseAmount(input).Should().Be((decimal)expected);

    [Theory]
    [InlineData("15/01/2026", 2026, 1, 15)]
    [InlineData("15-01-2026", 2026, 1, 15)]
    [InlineData("2026-01-15", 2026, 1, 15)]
    [InlineData("15-Jan-2026", 2026, 1, 15)]
    [InlineData("15 Jan 2026", 2026, 1, 15)]
    public void ParseDate_HandlesUaeFormats(string input, int y, int m, int d)
        => BankCsvParser.ParseDate(input).Should().Be(new DateOnly(y, m, d));

    [Fact]
    public void ParseDate_RejectsGarbage()
    {
        BankCsvParser.ParseDate("Closing Balance").Should().BeNull();
        BankCsvParser.ParseDate("31/02/2026").Should().BeNull();
    }

    [Fact]
    public void ParseCsvLine_HandlesEscapedQuotes()
    {
        BankCsvParser.ParseCsvLine("a,\"He said \"\"hi\"\"\",c").Should().Equal("a", "He said \"hi\"", "c");
    }
}
