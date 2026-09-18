namespace Xorva.Modules.Accounting.Reports.Export;

/// <summary>
/// Renderer-neutral report: a banner (entity / title / subtitle lines), one column header row,
/// body rows and footer rows. Cells are <see cref="string"/> or <see cref="decimal"/> (numbers stay
/// numeric in XLSX and are right-aligned in PDF). Both writers consume this, so a report is described once.
/// </summary>
public sealed class ReportTable
{
    public required string EntityName { get; init; }
    public required string Title { get; init; }
    public List<string> Subtitle { get; } = [];
    public required IReadOnlyList<ReportColumn> Columns { get; init; }
    public List<ReportRow> Rows { get; } = [];
    public List<ReportRow> Footer { get; } = [];
    /// <summary>Safe file name without extension.</summary>
    public required string FileStem { get; init; }
}

public sealed record ReportColumn(string Header, bool Numeric = false, double Width = 1.0);

public sealed record ReportRow(IReadOnlyList<object?> Cells, ReportRowStyle Style = ReportRowStyle.Normal, int Indent = 0);

public enum ReportRowStyle { Normal, Section, Bold, Blank }
