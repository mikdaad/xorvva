using System.IO.Compression;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Reports.Export;

namespace Xorva.Tests.Unit.Accounting;

/// <summary>The dependency-free XLSX / PDF writers must produce structurally valid files from the RPC payloads.</summary>
public class ReportExportTests
{
    private static ReportTable Sample() => ReportTableBuilders.TransactionRegister("Xorva Demo LLC", "AED",
    [
        new(Guid.NewGuid(), Guid.NewGuid(), new DateOnly(2026, 3, 1), "SI-2026-00001", "SalesInvoice", "Posted", "Blue Sky LLC", "PO-77", null, "AED",
            1050m, 1050m, 1050m, Guid.NewGuid(), "JV-2026-0001", "Admin", DateTime.UtcNow, 2, 1300m),
        new(Guid.NewGuid(), Guid.NewGuid(), new DateOnly(2026, 3, 2), "PV-2026-00001", "Payment", "Posted", null, "Rent (March) & DEWA <tax>", null, "USD",
            68m, 250m, null, Guid.NewGuid(), "JV-2026-0002", "Admin", DateTime.UtcNow, 2, 1300m),
    ], new DateOnly(2026, 3, 1), new DateOnly(2026, 3, 31));

    [Fact]
    public void Xlsx_IsAValidPackage_WithSheetStylesAndNumericCells()
    {
        var bytes = XlsxWriter.Write(Sample(), "Transactions");
        bytes.Take(2).Should().Equal((byte)'P', (byte)'K');

        using var zip = new ZipArchive(new MemoryStream(bytes), ZipArchiveMode.Read);
        zip.Entries.Select(e => e.FullName).Should().Contain(["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/styles.xml", "xl/_rels/workbook.xml.rels", "_rels/.rels"]);

        var sheet = new StreamReader(zip.GetEntry("xl/worksheets/sheet1.xml")!.Open()).ReadToEnd();
        sheet.Should().Contain("Xorva Demo LLC");
        sheet.Should().Contain("Transaction Register (Daybook)");
        sheet.Should().Contain("<v>1050</v>").And.Contain("<v>1300</v>", "amounts are numeric cells, not text");
        sheet.Should().Contain("Rent (March) &amp; DEWA &lt;tax&gt;", "XML is escaped");
        sheet.Should().Contain("01 Mar 2026");

        // every worksheet part must be well-formed XML
        foreach (var e in zip.Entries)
        {
            var xml = new StreamReader(e.Open()).ReadToEnd();
            var act = () => System.Xml.Linq.XDocument.Parse(xml);
            act.Should().NotThrow(e.FullName);
        }
    }

    [Fact]
    public void Pdf_HasHeaderXrefAndTrailer_AndPaginates()
    {
        var table = Sample();
        for (var i = 0; i < 150; i++) table.Rows.Add(table.Rows[0]);   // force several pages

        var bytes = PdfWriter.Write(table);
        var text = Encoding.Latin1.GetString(bytes);

        text.Should().StartWith("%PDF-1.4");
        text.Should().EndWith("%%EOF\n");
        text.Should().Contain("/Type /Catalog").And.Contain("/Type /Pages").And.Contain("Helvetica-Bold");
        text.Should().Contain("(Xorva Demo LLC) Tj");
        text.Should().Contain("Rent \\(March\\) & DEWA <tax>", "PDF string delimiters are escaped");

        var pageCount = System.Text.RegularExpressions.Regex.Matches(text, "/Type /Page ").Count;
        pageCount.Should().BeGreaterThan(2);
        text.Should().Contain($"/Count {pageCount}");

        // xref offsets must point at "N 0 obj"
        var startxref = int.Parse(text[(text.LastIndexOf("startxref", StringComparison.Ordinal) + 9)..].Trim().Split('\n')[0]);
        text.Substring(startxref, 4).Should().Be("xref");
        var firstOffset = int.Parse(text.Substring(text.IndexOf("0000000000 65535 f", StringComparison.Ordinal) + 20, 10));
        text.Substring(firstOffset, 7).Should().Be("1 0 obj");
    }

    [Fact]
    public void BalanceSheetBuilder_WalksTheTree_WithIndentation()
    {
        const string json = """
        {
          "entityName": "Xorva Demo LLC", "baseCurrency": "AED", "asOf": "2026-03-31",
          "assets": { "total": 1500, "nodes": [
             { "id": "a", "name": "Current Assets", "code": "1", "isGroup": true, "amount": 1500, "drillAccountId": null,
               "children": [ { "id": "b", "name": "Bank", "code": "1010", "isGroup": false, "amount": 1500, "drillAccountId": "b", "children": [] } ] } ] },
          "liabilities": { "total": 500, "nodes": [] },
          "equity": { "total": 1000, "nodes": [] },
          "retainedEarnings": 1000, "totalAssets": 1500, "totalLiabilitiesAndEquity": 1500, "difference": 0
        }
        """;
        var t = ReportTableBuilders.BalanceSheet(JsonDocument.Parse(json).RootElement);

        t.FileStem.Should().Be("Balance_Sheet_2026-03-31");
        t.Subtitle[0].Should().Be("As Of: 31 Mar 2026 | Base Currency: AED");
        var bank = t.Rows.Single(r => r.Cells.Count > 1 && Equals(r.Cells[1], "Bank"));
        bank.Indent.Should().Be(1);
        bank.Cells[2].Should().Be(1500m);
        t.Rows.Single(r => r.Cells.Count > 1 && Equals(r.Cells[1], "Current Assets")).Style.Should().Be(ReportRowStyle.Bold);
        t.Footer.Last().Cells[1].Should().Be("NET DIFFERENCE");

        // both renderers accept it
        XlsxWriter.Write(t).Length.Should().BeGreaterThan(500);
        PdfWriter.Write(t).Length.Should().BeGreaterThan(500);
    }

    [Fact]
    public void LedgerBuilder_UsesRunningBalanceAndTotals()
    {
        const string json = """
        { "entityName": "E", "baseCurrency": "AED", "accountName": "Bank / Main", "accountCode": "1010", "from": null, "to": "2026-03-31",
          "openingBalance": 100, "lines": [ { "date": "2026-03-05", "entryNumber": "JV-1", "narration": null, "debit": 50, "credit": 0, "runningBalance": 150 } ],
          "totalDebit": 50, "totalCredit": 0, "closingBalance": 150 }
        """;
        var t = ReportTableBuilders.LedgerStatement(JsonDocument.Parse(json).RootElement);
        t.FileStem.Should().Be("Ledger_Bank___Main");
        t.Subtitle[0].Should().Be("Period: — to 31 Mar 2026 | Currency: AED");
        t.Rows.Should().HaveCount(2);
        t.Rows[1].Cells[5].Should().Be(150m);
        t.Footer[1].Cells[5].Should().Be(150m);
    }
}
