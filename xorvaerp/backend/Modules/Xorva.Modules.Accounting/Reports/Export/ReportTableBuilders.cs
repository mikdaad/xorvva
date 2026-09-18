using System.Globalization;
using System.Text.Json;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Vouchers.Common;

namespace Xorva.Modules.Accounting.Reports.Export;

/// <summary>
/// Turns the RPC report payloads into <see cref="ReportTable"/>s — one place mirroring TrueLedge's
/// xlsx-generator.ts / pdf-generator.tsx layouts (Daybook, Balance Sheet, Ledger Statement) plus the
/// Trial Balance which TrueLedge did not export.
/// </summary>
public static class ReportTableBuilders
{
    private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

    public static ReportTable TransactionRegister(string entityName, string baseCurrency, IReadOnlyList<RpcRegisterRow> rows, DateOnly? from, DateOnly? to)
    {
        var t = new ReportTable
        {
            EntityName = entityName,
            Title = "Transaction Register (Daybook)",
            FileStem = $"Transaction_Register_{DateTime.UtcNow:yyyy-MM-dd}",
            Columns =
            [
                new("Date", Width: 0.9), new("Voucher No", Width: 1.1), new("Type", Width: 0.9), new("Party Name", Width: 1.6),
                new("Reference", Width: 1.1), new("Status", Width: 0.8), new("Currency", Width: 0.6),
                new($"Base Amount ({baseCurrency})", Numeric: true, Width: 1.1), new("Created By", Width: 1.1),
            ],
        };
        t.Subtitle.Add($"Period: {Fmt(from)} to {Fmt(to)} | Base Currency: {baseCurrency}");
        foreach (var r in rows)
        {
            var type = Enum.TryParse<VoucherType>(r.VoucherType, out var vt) ? VoucherTypes.For(vt).Label : r.VoucherType;
            t.Rows.Add(new ReportRow([Fmt(r.VoucherDate), r.VoucherNumber, type, r.ContactName ?? "—", r.Reference ?? "—", r.Status, r.Currency, r.BaseTotalAmount, r.CreatedByName ?? "—"]));
        }
        var total = rows.Count > 0 ? rows[0].TotalBaseAmount : 0m;
        t.Footer.Add(new ReportRow(["Total", "", "", "", "", "", "", total, ""]));
        return t;
    }

    public static ReportTable BalanceSheet(JsonElement bs)
    {
        var currency = Str(bs, "baseCurrency") ?? "AED";
        var asOf = Str(bs, "asOf");
        var t = new ReportTable
        {
            EntityName = Str(bs, "entityName") ?? "",
            Title = "Balance Sheet",
            FileStem = $"Balance_Sheet_{asOf}",
            Columns = [new("Account Code", Width: 0.8), new("Account / Group Name", Width: 2.6), new($"Amount ({currency})", Numeric: true, Width: 1.0)],
        };
        t.Subtitle.Add($"As Of: {Fmt(asOf)} | Base Currency: {currency}");

        Section("ASSETS", "TOTAL ASSETS", bs.GetProperty("assets"), Dec(bs, "totalAssets"));
        Section("LIABILITIES", "TOTAL LIABILITIES", bs.GetProperty("liabilities"), Dec(bs.GetProperty("liabilities"), "total"));
        Section("EQUITY & CAPITAL", "TOTAL EQUITY", bs.GetProperty("equity"), Dec(bs.GetProperty("equity"), "total"));
        t.Footer.Add(new ReportRow(["", "TOTAL LIABILITIES & EQUITY", Dec(bs, "totalLiabilitiesAndEquity")]));
        t.Footer.Add(new ReportRow(["", "NET DIFFERENCE", Dec(bs, "difference")]));
        return t;

        void Section(string title, string totalLabel, JsonElement section, decimal total)
        {
            t.Rows.Add(new ReportRow(["", title, ""], ReportRowStyle.Section));
            if (section.TryGetProperty("nodes", out var nodes) && nodes.ValueKind == JsonValueKind.Array)
                foreach (var n in nodes.EnumerateArray()) Node(n, 0);
            t.Rows.Add(new ReportRow(["", totalLabel, total], ReportRowStyle.Bold));
            t.Rows.Add(new ReportRow([], ReportRowStyle.Blank));
        }

        void Node(JsonElement n, int depth)
        {
            var isGroup = n.TryGetProperty("isGroup", out var g) && g.ValueKind == JsonValueKind.True;
            t.Rows.Add(new ReportRow([Str(n, "code") ?? "", Str(n, "name") ?? "", Dec(n, "amount")], isGroup ? ReportRowStyle.Bold : ReportRowStyle.Normal, depth));
            if (n.TryGetProperty("children", out var children) && children.ValueKind == JsonValueKind.Array)
                foreach (var c in children.EnumerateArray()) Node(c, depth + 1);
        }
    }

    public static ReportTable LedgerStatement(JsonElement ls)
    {
        var currency = Str(ls, "baseCurrency") ?? "AED";
        var accountName = Str(ls, "accountName") ?? "Account";
        var safe = new string(accountName.Select(ch => char.IsLetterOrDigit(ch) || ch is '_' or '-' ? ch : '_').ToArray());
        var t = new ReportTable
        {
            EntityName = Str(ls, "entityName") ?? "",
            Title = $"Ledger Statement: {accountName} ({Str(ls, "accountCode") ?? "No Code"})",
            FileStem = $"Ledger_{safe}",
            Columns =
            [
                new("Date", Width: 0.8), new("Entry No", Width: 1.0), new("Narration", Width: 2.4),
                new($"Debit ({currency})", Numeric: true), new($"Credit ({currency})", Numeric: true), new($"Balance ({currency})", Numeric: true),
            ],
        };
        t.Subtitle.Add($"Period: {Fmt(Str(ls, "from"))} to {Fmt(Str(ls, "to"))} | Currency: {currency}");
        t.Rows.Add(new ReportRow(["", "", "Opening Balance", "", "", Dec(ls, "openingBalance")], ReportRowStyle.Bold));
        if (ls.TryGetProperty("lines", out var lines) && lines.ValueKind == JsonValueKind.Array)
            foreach (var l in lines.EnumerateArray())
                t.Rows.Add(new ReportRow([Fmt(Str(l, "date")), Str(l, "entryNumber") ?? "", Str(l, "narration") ?? "—", Dec(l, "debit"), Dec(l, "credit"), Dec(l, "runningBalance")]));
        t.Footer.Add(new ReportRow(["", "", "Totals", Dec(ls, "totalDebit"), Dec(ls, "totalCredit"), ""]));
        t.Footer.Add(new ReportRow(["", "", "Closing Balance", "", "", Dec(ls, "closingBalance")]));
        return t;
    }

    public static ReportTable TrialBalance(string entityName, string baseCurrency, IReadOnlyList<RpcTrialBalanceRow> rows, DateOnly? from, DateOnly? to)
    {
        var t = new ReportTable
        {
            EntityName = entityName,
            Title = "Trial Balance",
            FileStem = $"Trial_Balance_{to?.ToString("yyyy-MM-dd", Inv) ?? DateTime.UtcNow.ToString("yyyy-MM-dd", Inv)}",
            Columns =
            [
                new("Code", Width: 0.7), new("Account", Width: 2.2), new("Type", Width: 0.9),
                new("Opening Dr", Numeric: true), new("Opening Cr", Numeric: true), new("Period Dr", Numeric: true), new("Period Cr", Numeric: true),
                new("Closing Dr", Numeric: true), new("Closing Cr", Numeric: true),
            ],
        };
        t.Subtitle.Add($"Period: {Fmt(from)} to {Fmt(to)} | Base Currency: {baseCurrency}");
        foreach (var r in rows)
            t.Rows.Add(new ReportRow([r.Code, r.Name, r.AccountType, r.OpeningDebit, r.OpeningCredit, r.PeriodDebit, r.PeriodCredit, r.ClosingDebit, r.ClosingCredit],
                r.IsGroup ? ReportRowStyle.Bold : ReportRowStyle.Normal));
        var leaves = rows.Where(r => !r.IsGroup).ToList();
        t.Footer.Add(new ReportRow(["", "Totals", "", leaves.Sum(r => r.OpeningDebit), leaves.Sum(r => r.OpeningCredit), leaves.Sum(r => r.PeriodDebit), leaves.Sum(r => r.PeriodCredit), leaves.Sum(r => r.ClosingDebit), leaves.Sum(r => r.ClosingCredit)]));
        return t;
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private static string? Str(JsonElement e, string name) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;

    private static decimal Dec(JsonElement e, string name)
    {
        if (e.ValueKind != JsonValueKind.Object || !e.TryGetProperty(name, out var p)) return 0m;
        return p.ValueKind switch
        {
            JsonValueKind.Number => p.GetDecimal(),
            JsonValueKind.String when decimal.TryParse(p.GetString(), NumberStyles.Any, Inv, out var d) => d,
            _ => 0m,
        };
    }

    /// <summary>TrueLedge formatReportDate: DD MMM YYYY, "—" when null.</summary>
    public static string Fmt(DateOnly? d) => d is { } x ? x.ToString("dd MMM yyyy", Inv) : "—";
    public static string Fmt(string? iso) => DateOnly.TryParse(iso, Inv, out var d) ? Fmt(d) : "—";
}
