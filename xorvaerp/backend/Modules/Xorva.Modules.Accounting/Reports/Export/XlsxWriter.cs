using System.Globalization;
using System.IO.Compression;
using System.Text;
using System.Xml;

namespace Xorva.Modules.Accounting.Reports.Export;

/// <summary>
/// Minimal, dependency-free SpreadsheetML writer (single sheet, inline strings, four cell styles).
/// Deliberately small: enough for the Daybook / Balance Sheet / Ledger exports ported from TrueLedge's
/// xlsx-generator.ts without pulling ClosedXML/EPPlus into the build. Opens cleanly in Excel, LibreOffice and Numbers.
/// </summary>
public static class XlsxWriter
{
    // style ids in styles.xml cellXfs: 0 normal, 1 bold, 2 number #,##0.00, 3 bold number, 4 title
    private const int StyleNormal = 0, StyleBold = 1, StyleNumber = 2, StyleBoldNumber = 3, StyleTitle = 4;

    public static byte[] Write(ReportTable table, string sheetName = "Report")
    {
        using var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
        {
            Add(zip, "[Content_Types].xml", ContentTypes);
            Add(zip, "_rels/.rels", Rels);
            Add(zip, "xl/workbook.xml", Workbook(sheetName));
            Add(zip, "xl/_rels/workbook.xml.rels", WorkbookRels);
            Add(zip, "xl/styles.xml", Styles);
            Add(zip, "xl/worksheets/sheet1.xml", Sheet(table));
        }
        return ms.ToArray();
    }

    private static void Add(ZipArchive zip, string path, string xml)
    {
        var entry = zip.CreateEntry(path, CompressionLevel.Optimal);
        using var w = new StreamWriter(entry.Open(), new UTF8Encoding(false));
        w.Write(xml);
    }

    private static string Sheet(ReportTable t)
    {
        var sb = new StringBuilder();
        sb.Append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>");
        sb.Append("<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">");
        sb.Append("<cols>");
        for (var i = 0; i < t.Columns.Count; i++)
            sb.Append(CultureInfo.InvariantCulture, $"<col min=\"{i + 1}\" max=\"{i + 1}\" width=\"{Math.Max(10, 18 * t.Columns[i].Width):0.##}\" customWidth=\"1\"/>");
        sb.Append("</cols><sheetData>");

        var r = 1;
        Row(sb, r++, [t.EntityName], StyleTitle);
        Row(sb, r++, [t.Title], StyleBold);
        foreach (var line in t.Subtitle) Row(sb, r++, [line], StyleNormal);
        r++; // blank
        Row(sb, r++, [.. t.Columns.Select(c => (object?)c.Header)], StyleBold, t.Columns);
        foreach (var row in t.Rows) DataRow(sb, r++, row, t.Columns);
        if (t.Footer.Count > 0)
        {
            r++;
            foreach (var row in t.Footer) DataRow(sb, r++, row with { Style = row.Style == ReportRowStyle.Normal ? ReportRowStyle.Bold : row.Style }, t.Columns);
        }
        sb.Append("</sheetData></worksheet>");
        return sb.ToString();
    }

    private static void DataRow(StringBuilder sb, int r, ReportRow row, IReadOnlyList<ReportColumn> cols)
    {
        if (row.Style == ReportRowStyle.Blank) return;
        var bold = row.Style is ReportRowStyle.Bold or ReportRowStyle.Section;
        var cells = row.Cells.ToList();
        if (row.Indent > 0)
        {
            // indent the first textual cell (Balance Sheet hierarchy)
            var idx = cells.FindIndex(c => c is string s && s.Length > 0);
            if (idx >= 0) cells[idx] = new string(' ', row.Indent * 2) + cells[idx];
        }
        Row(sb, r, cells, bold ? StyleBold : StyleNormal, cols);
    }

    private static void Row(StringBuilder sb, int r, IReadOnlyList<object?> cells, int textStyle, IReadOnlyList<ReportColumn>? cols = null)
    {
        sb.Append(CultureInfo.InvariantCulture, $"<row r=\"{r}\">");
        for (var c = 0; c < cells.Count; c++)
        {
            var reference = ColumnLetter(c) + r.ToString(CultureInfo.InvariantCulture);
            var value = cells[c];
            if (value is null || (value is string s0 && s0.Length == 0)) continue;
            if (value is decimal or int or long or double)
            {
                var num = Convert.ToDecimal(value, CultureInfo.InvariantCulture);
                var style = textStyle == StyleBold ? StyleBoldNumber : StyleNumber;
                sb.Append(CultureInfo.InvariantCulture, $"<c r=\"{reference}\" s=\"{style}\"><v>{num}</v></c>");
            }
            else
            {
                sb.Append(CultureInfo.InvariantCulture, $"<c r=\"{reference}\" s=\"{textStyle}\" t=\"inlineStr\"><is><t xml:space=\"preserve\">{Esc(value.ToString()!)}</t></is></c>");
            }
        }
        sb.Append("</row>");
    }

    private static string ColumnLetter(int index)
    {
        var s = string.Empty;
        index++;
        while (index > 0) { var m = (index - 1) % 26; s = (char)('A' + m) + s; index = (index - m) / 26; }
        return s;
    }

    private static string Esc(string s)
    {
        var sb = new StringBuilder(s.Length);
        foreach (var ch in s)
        {
            if (!XmlConvert.IsXmlChar(ch)) continue;
            sb.Append(ch switch { '&' => "&amp;", '<' => "&lt;", '>' => "&gt;", '"' => "&quot;", _ => ch.ToString() });
        }
        return sb.ToString();
    }

    private const string ContentTypes =
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
        "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">" +
        "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>" +
        "<Default Extension=\"xml\" ContentType=\"application/xml\"/>" +
        "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>" +
        "<Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>" +
        "<Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/>" +
        "</Types>";

    private const string Rels =
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
        "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
        "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/>" +
        "</Relationships>";

    private static string Workbook(string sheetName) =>
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
        "<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">" +
        $"<sheets><sheet name=\"{Esc(sheetName.Length > 31 ? sheetName[..31] : sheetName)}\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>";

    private const string WorkbookRels =
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
        "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
        "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/>" +
        "<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>" +
        "</Relationships>";

    private const string Styles =
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
        "<styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">" +
        "<numFmts count=\"1\"><numFmt numFmtId=\"164\" formatCode=\"#,##0.00;[Red]-#,##0.00\"/></numFmts>" +
        "<fonts count=\"3\"><font><sz val=\"11\"/><name val=\"Calibri\"/></font><font><b/><sz val=\"11\"/><name val=\"Calibri\"/></font><font><b/><sz val=\"14\"/><name val=\"Calibri\"/></font></fonts>" +
        "<fills count=\"2\"><fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill></fills>" +
        "<borders count=\"1\"><border><left/><right/><top/><bottom/><diagonal/></border></borders>" +
        "<cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs>" +
        "<cellXfs count=\"5\">" +
        "<xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\"/>" +
        "<xf numFmtId=\"0\" fontId=\"1\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyFont=\"1\"/>" +
        "<xf numFmtId=\"164\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyNumberFormat=\"1\"/>" +
        "<xf numFmtId=\"164\" fontId=\"1\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyNumberFormat=\"1\" applyFont=\"1\"/>" +
        "<xf numFmtId=\"0\" fontId=\"2\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyFont=\"1\"/>" +
        "</cellXfs>" +
        "<cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/></cellStyles>" +
        "</styleSheet>";
}
