using System.Globalization;
using System.Text;

namespace Xorva.Modules.Accounting.Reports.Export;

/// <summary>
/// Minimal, dependency-free PDF 1.4 writer for tabular reports (A4 portrait/landscape, Helvetica base-14
/// fonts, automatic pagination, repeated column headers, page numbers). Replaces TrueLedge's
/// @react-pdf/renderer templates without adding a NuGet dependency.
///
/// Limitation: base-14 fonts are WinAnsi — Latin text only. Characters outside Latin-1 (e.g. Arabic
/// <c>NameAr</c>) are replaced with '?'. Swap in QuestPDF + an embedded font when Arabic PDFs are required;
/// the <see cref="ReportTable"/> model is renderer-neutral so only this file changes.
/// </summary>
public static class PdfWriter
{
    private const double PtPerMm = 72 / 25.4;
    private const double Margin = 14 * PtPerMm;
    private const double BodySize = 8.5, HeaderSize = 8.5, TitleSize = 14, SubSize = 9, LineH = 12.5;

    public static byte[] Write(ReportTable table)
    {
        var landscape = table.Columns.Count > 5;
        double pageW = landscape ? 841.89 : 595.28, pageH = landscape ? 595.28 : 841.89;
        var usable = pageW - 2 * Margin;

        var weights = table.Columns.Select(c => c.Width).ToArray();
        var totalW = weights.Sum();
        var colW = weights.Select(w => usable * w / totalW).ToArray();

        var pages = new List<string>();
        var sb = new StringBuilder();
        var y = pageH - Margin;
        var pageNo = 0;

        void BeginPage()
        {
            sb = new StringBuilder();
            pageNo++;
            y = pageH - Margin;
            if (pageNo == 1)
            {
                Text(sb, Margin, y - TitleSize, "F2", TitleSize, table.EntityName); y -= TitleSize + 4;
                Text(sb, Margin, y - 11, "F2", 11, table.Title); y -= 15;
                foreach (var line in table.Subtitle) { Text(sb, Margin, y - SubSize, "F1", SubSize, line); y -= SubSize + 3; }
                y -= 6;
            }
            HeaderRow();
        }

        void HeaderRow()
        {
            // shaded header band
            sb.Append(CultureInfo.InvariantCulture, $"0.92 g {Margin:0.##} {y - LineH - 2:0.##} {usable:0.##} {LineH + 2:0.##} re f 0 g\n");
            var x = Margin;
            for (var i = 0; i < table.Columns.Count; i++)
            {
                Cell(sb, x, y - LineH + 2.5, colW[i], "F2", HeaderSize, table.Columns[i].Header, table.Columns[i].Numeric);
                x += colW[i];
            }
            y -= LineH + 2;
            sb.Append(CultureInfo.InvariantCulture, $"0.6 w {Margin:0.##} {y:0.##} m {Margin + usable:0.##} {y:0.##} l S\n");
            y -= 3;
        }

        void EndPage()
        {
            var footer = $"Page {pageNo}";
            Text(sb, pageW - Margin - Width(footer, 7.5), Margin - 14, "F1", 7.5, footer);
            Text(sb, Margin, Margin - 14, "F1", 7.5, $"Generated {DateTime.UtcNow:yyyy-MM-dd HH:mm} UTC");
            pages.Add(sb.ToString());
        }

        void Emit(ReportRow row)
        {
            if (y - LineH < Margin) { EndPage(); BeginPage(); }
            if (row.Style == ReportRowStyle.Blank) { y -= LineH / 2; return; }
            var bold = row.Style is ReportRowStyle.Bold or ReportRowStyle.Section;
            if (row.Style == ReportRowStyle.Section)
                sb.Append(CultureInfo.InvariantCulture, $"0.96 g {Margin:0.##} {y - LineH:0.##} {usable:0.##} {LineH:0.##} re f 0 g\n");
            var x = Margin;
            for (var i = 0; i < table.Columns.Count && i < row.Cells.Count; i++)
            {
                var v = row.Cells[i];
                var text = v switch
                {
                    null => string.Empty,
                    decimal d => d.ToString("#,##0.00;(#,##0.00)", CultureInfo.InvariantCulture),
                    double d => d.ToString("#,##0.00;(#,##0.00)", CultureInfo.InvariantCulture),
                    _ => v.ToString()!,
                };
                var indent = i == 0 ? row.Indent * 8 : 0;
                Cell(sb, x + indent, y - LineH + 3, colW[i] - indent, bold ? "F2" : "F1", BodySize, text, table.Columns[i].Numeric || v is decimal or double);
                x += colW[i];
            }
            y -= LineH;
            if (bold) sb.Append(CultureInfo.InvariantCulture, $"0.3 w {Margin:0.##} {y:0.##} m {Margin + usable:0.##} {y:0.##} l S\n");
        }

        BeginPage();
        foreach (var r in table.Rows) Emit(r);
        if (table.Footer.Count > 0)
        {
            Emit(new ReportRow([], ReportRowStyle.Blank));
            foreach (var r in table.Footer) Emit(r with { Style = r.Style == ReportRowStyle.Normal ? ReportRowStyle.Bold : r.Style });
        }
        EndPage();

        return Assemble(pages, pageW, pageH);
    }

    // ── primitives ───────────────────────────────────────────────────────────

    private static void Cell(StringBuilder sb, double x, double y, double width, string font, double size, string text, bool right)
    {
        text = Fit(text, size, width - 4);
        var tx = right ? x + width - 2 - Width(text, size) : x + 2;
        Text(sb, tx, y, font, size, text);
    }

    private static void Text(StringBuilder sb, double x, double y, string font, double size, string text)
    {
        if (string.IsNullOrEmpty(text)) return;
        sb.Append(CultureInfo.InvariantCulture, $"BT /{font} {size:0.##} Tf {x:0.##} {y:0.##} Td ({Escape(text)}) Tj ET\n");
    }

    private static string Fit(string text, double size, double width)
    {
        if (Width(text, size) <= width) return text;
        var t = text;
        while (t.Length > 1 && Width(t + "…", size) > width) t = t[..^1];
        return t + "…";
    }

    /// <summary>Approximate Helvetica advance: average glyph ≈ 0.5 em, wide chars more, narrow less.</summary>
    private static double Width(string text, double size)
    {
        double w = 0;
        foreach (var ch in text)
            w += ch switch
            {
                'i' or 'l' or 'j' or 't' or 'f' or 'I' or '.' or ',' or ':' or ';' or '\'' or '|' or ' ' => 0.28,
                'm' or 'w' or 'M' or 'W' => 0.83,
                >= '0' and <= '9' => 0.556,
                >= 'A' and <= 'Z' => 0.67,
                _ => 0.52,
            };
        return w * size;
    }

    private static string Escape(string s)
    {
        var sb = new StringBuilder(s.Length);
        foreach (var ch in s)
        {
            switch (ch)
            {
                case '(' or ')' or '\\': sb.Append('\\').Append(ch); break;
                case '\r' or '\n': sb.Append(' '); break;
                case '…': sb.Append("\\205"); break;                 // WinAnsi ellipsis
                case '—': sb.Append("\\227"); break;                 // em dash
                case '–': sb.Append("\\226"); break;                 // en dash
                case '≠': sb.Append("<>"); break;
                default:
                    if (ch < 128) sb.Append(ch);
                    else if (ch is >= '\u00A0' and <= '\u00FF') sb.Append('\\').Append(Convert.ToString(ch, 8).PadLeft(3, '0'));
                    else sb.Append('?');
                    break;
            }
        }
        return sb.ToString();
    }

    private static byte[] Assemble(List<string> pages, double w, double h)
    {
        // objects: 1 catalog, 2 pages, 3 F1 Helvetica, 4 F2 Helvetica-Bold, then per page: page obj + content obj
        var objects = new List<string>();
        var pageIds = new List<int>();
        var firstPageObj = 5;
        for (var i = 0; i < pages.Count; i++) pageIds.Add(firstPageObj + i * 2);

        objects.Add("<< /Type /Catalog /Pages 2 0 R >>");
        objects.Add($"<< /Type /Pages /Kids [{string.Join(' ', pageIds.Select(id => $"{id} 0 R"))}] /Count {pages.Count} >>");
        objects.Add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
        objects.Add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
        for (var i = 0; i < pages.Count; i++)
        {
            var contentId = pageIds[i] + 1;
            objects.Add(string.Create(CultureInfo.InvariantCulture,
                $"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {w:0.##} {h:0.##}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {contentId} 0 R >>"));
            var bytes = Encoding.Latin1.GetByteCount(pages[i]);
            objects.Add($"<< /Length {bytes} >>\nstream\n{pages[i]}endstream");
        }

        var latin1 = Encoding.Latin1;
        using var ms = new MemoryStream();
        void W(string s) { var b = latin1.GetBytes(s); ms.Write(b, 0, b.Length); }

        W("%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n");
        var offsets = new List<long>();
        for (var i = 0; i < objects.Count; i++)
        {
            offsets.Add(ms.Position);
            W($"{i + 1} 0 obj\n{objects[i]}\nendobj\n");
        }
        var xref = ms.Position;
        W($"xref\n0 {objects.Count + 1}\n0000000000 65535 f \n");
        foreach (var o in offsets) W($"{o:0000000000} 00000 n \n");
        W($"trailer\n<< /Size {objects.Count + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n");
        return ms.ToArray();
    }
}
