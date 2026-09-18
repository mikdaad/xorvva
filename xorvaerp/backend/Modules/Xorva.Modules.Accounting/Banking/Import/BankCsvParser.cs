using System.Globalization;
using System.Text.RegularExpressions;

namespace Xorva.Modules.Accounting.Banking.Import;

/// <summary>One statement row after normalisation. Field names mirror the JSON keys <c>accounting.import_bank_statement</c> expects.</summary>
public sealed record ParsedBankLine(
    DateOnly LineDate,
    DateOnly? ValueDate,
    string Description,
    string? Reference,
    string? ChequeNumber,
    decimal Debit,
    decimal Credit,
    decimal? Balance,
    IReadOnlyDictionary<string, string> RawData);

public sealed record BankCsvParseResult(
    bool Success,
    string BankFormat,
    IReadOnlyList<ParsedBankLine> Lines,
    IReadOnlyList<string> Headers,
    int SkippedRows,
    IReadOnlyList<string> Errors,
    DateOnly? PeriodFrom,
    DateOnly? PeriodTo,
    decimal TotalDebits,
    decimal TotalCredits);

/// <summary>
/// UAE bank-statement CSV parser — a faithful port of TrueLedge <c>lib/banking/csv-parser.ts</c>.
/// Handles the messy exports of ENBD, ADCB, FAB, Mashreq, RAK and DIB:
///  * quote-aware field splitting (commas inside quotes, doubled quotes);
///  * skips bank-name/address banner rows — the header is the first of the top 15 rows with
///    ≥ 4 fields that contains a date-ish AND a description-ish column name;
///  * detects the bank by scoring header variants (≥ 3 hits wins, else "unknown");
///  * dates DD/MM/YYYY · DD-MM-YYYY · YYYY-MM-DD · DD-MMM-YYYY · DD MMM YYYY;
///  * amounts with (parentheses), DR/CR suffix, leading minus, currency symbols and thousands separators;
///  * a single signed "Amount" column when there are no Debit/Credit columns.
/// Pure and allocation-light; safe to unit test without a database.
/// </summary>
public static partial class BankCsvParser
{
    private sealed record ColumnMapping(
        string[] Date, string[] ValueDate, string[] Description, string[] Reference,
        string[] Cheque, string[] Debit, string[] Credit, string[] Balance)
    {
        public IEnumerable<string[]> All => [Date, ValueDate, Description, Reference, Cheque, Debit, Credit, Balance];
    }

    private static readonly Dictionary<string, ColumnMapping> BankMappings = new()
    {
        ["enbd"] = new(
            ["Date", "Transaction Date", "Txn Date", "Posting Date"], ["Value Date"],
            ["Description", "Narrative", "Transaction Description", "Particulars"], ["Reference", "Ref No", "Reference Number"],
            ["Cheque No", "Cheque Number", "Chq No"], ["Debit", "Debit Amount", "Withdrawal", "DR"],
            ["Credit", "Credit Amount", "Deposit", "CR"], ["Balance", "Running Balance", "Closing Balance"]),
        ["adcb"] = new(
            ["Transaction Date", "Date", "Txn Date"], ["Value Date", "Val Date"],
            ["Description", "Transaction Details", "Narrative"], ["Reference No", "Ref", "Reference"],
            ["Cheque No"], ["Debit", "Withdrawals", "DR Amount"], ["Credit", "Deposits", "CR Amount"], ["Balance", "Available Balance"]),
        ["fab"] = new(
            ["Date", "Transaction Date", "Posted Date"], ["Value Date"],
            ["Description", "Details", "Narrative"], ["Reference", "Transaction Reference"],
            ["Cheque No", "Instrument No"], ["Debit", "Debit Amount"], ["Credit", "Credit Amount"], ["Balance", "Ledger Balance"]),
        ["mashreq"] = new(
            ["Date", "Posting Date", "Transaction Date"], ["Value Date"],
            ["Description", "Transaction Description", "Narration"], ["Reference", "Ref No"],
            ["Cheque No"], ["Debit", "Amount Debited"], ["Credit", "Amount Credited"], ["Balance"]),
        ["rak"] = new(
            ["Transaction Date", "Date"], ["Value Date"],
            ["Description", "Particulars"], ["Reference Number", "Reference"],
            ["Cheque Number"], ["Debit", "Withdrawal"], ["Credit", "Deposit"], ["Balance", "Running Balance"]),
        ["dib"] = new(
            ["Date", "Transaction Date"], ["Value Date"],
            ["Description", "Narrative", "Transaction Narrative"], ["Reference", "Ref"],
            ["Cheque No"], ["Debit", "Dr"], ["Credit", "Cr"], ["Balance"]),
        ["unknown"] = new(
            ["Date", "Transaction Date", "Txn Date", "Posting Date", "Posted Date"], ["Value Date", "Val Date"],
            ["Description", "Narrative", "Details", "Particulars", "Transaction Description"], ["Reference", "Ref", "Reference No", "Ref No"],
            ["Cheque No", "Cheque Number", "Chq No"], ["Debit", "Debit Amount", "Withdrawal", "DR", "Dr"],
            ["Credit", "Credit Amount", "Deposit", "CR", "Cr"], ["Balance", "Running Balance", "Closing Balance"]),
    };

    // ── CSV line splitting ───────────────────────────────────────────────────

    /// <summary>Quote-aware split of one CSV line: commas inside quotes are preserved, "" is an escaped quote.</summary>
    public static List<string> ParseCsvLine(string line)
    {
        var fields = new List<string>();
        var current = new System.Text.StringBuilder();
        var inQuotes = false;
        for (var i = 0; i < line.Length; i++)
        {
            var ch = line[i];
            if (inQuotes)
            {
                if (ch == '"')
                {
                    if (i + 1 < line.Length && line[i + 1] == '"') { current.Append('"'); i++; }
                    else inQuotes = false;
                }
                else current.Append(ch);
            }
            else if (ch == '"') inQuotes = true;
            else if (ch == ',') { fields.Add(current.ToString().Trim()); current.Clear(); }
            else current.Append(ch);
        }
        fields.Add(current.ToString().Trim());
        return fields;
    }

    // ── dates ────────────────────────────────────────────────────────────────

    [GeneratedRegex(@"^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$")] private static partial Regex DmyRegex();
    [GeneratedRegex(@"^(\d{4})-(\d{2})-(\d{2})$")] private static partial Regex IsoRegex();
    [GeneratedRegex(@"^(\d{1,2})-([A-Za-z]{3})-(\d{4})$")] private static partial Regex DMonYRegex();
    [GeneratedRegex(@"^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$")] private static partial Regex DMonYSpaceRegex();

    private static readonly Dictionary<string, int> Months = new(StringComparer.OrdinalIgnoreCase)
    {
        ["jan"] = 1, ["feb"] = 2, ["mar"] = 3, ["apr"] = 4, ["may"] = 5, ["jun"] = 6,
        ["jul"] = 7, ["aug"] = 8, ["sep"] = 9, ["oct"] = 10, ["nov"] = 11, ["dec"] = 12,
    };

    public static DateOnly? ParseDate(string? value)
    {
        var s = (value ?? string.Empty).Trim();
        if (s.Length == 0) return null;
        Match m;
        if ((m = DmyRegex().Match(s)).Success) return Make(m.Groups[3].Value, m.Groups[2].Value, m.Groups[1].Value);
        if ((m = IsoRegex().Match(s)).Success) return Make(m.Groups[1].Value, m.Groups[2].Value, m.Groups[3].Value);
        if ((m = DMonYRegex().Match(s)).Success || (m = DMonYSpaceRegex().Match(s)).Success)
            return Months.TryGetValue(m.Groups[2].Value, out var mon) ? Make(m.Groups[3].Value, mon.ToString(), m.Groups[1].Value) : null;
        return null;

        static DateOnly? Make(string y, string mo, string d) =>
            int.TryParse(y, out var yy) && int.TryParse(mo, out var mm) && int.TryParse(d, out var dd)
            && mm is >= 1 and <= 12 && dd >= 1 && dd <= DateTime.DaysInMonth(yy, mm)
                ? new DateOnly(yy, mm, dd) : null;
    }

    // ── amounts ──────────────────────────────────────────────────────────────

    [GeneratedRegex(@"\s*DR\s*$", RegexOptions.IgnoreCase)] private static partial Regex DrSuffix();
    [GeneratedRegex(@"\s*CR\s*$", RegexOptions.IgnoreCase)] private static partial Regex CrSuffix();
    [GeneratedRegex(@"[AED$€£¥,\s]")] private static partial Regex Symbols();

    /// <summary>(1,234.56) · -1234.56 · 1,234.56 CR · 1234.56 DR · AED 1,000 · blank/"-" → 0.</summary>
    public static decimal ParseAmount(string? value)
    {
        var s = (value ?? string.Empty).Trim();
        if (s.Length == 0 || s == "-") return 0m;
        var negative = false;

        if (s.StartsWith('(') && s.EndsWith(')')) { negative = true; s = s[1..^1]; }
        if (DrSuffix().IsMatch(s)) { negative = true; s = DrSuffix().Replace(s, ""); }
        if (CrSuffix().IsMatch(s)) s = CrSuffix().Replace(s, "");
        if (s.StartsWith('-')) { negative = true; s = s[1..]; }
        s = Symbols().Replace(s, "");

        if (!decimal.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var num)) return 0m;
        num = Math.Abs(num);
        return negative ? -num : num;
    }

    // ── header detection ─────────────────────────────────────────────────────

    [GeneratedRegex(@"^(date|transaction date|txn date|posting date|posted date)$", RegexOptions.IgnoreCase)] private static partial Regex DateHeader();
    [GeneratedRegex(@"^(description|narrative|details|particulars|transaction description)$", RegexOptions.IgnoreCase)] private static partial Regex DescHeader();

    public static string DetectBankFormat(IReadOnlyList<string> headers)
    {
        var set = new HashSet<string>(headers.Select(h => h.Trim().ToLowerInvariant()));
        var best = ("unknown", 0);
        foreach (var (bank, mapping) in BankMappings)
        {
            if (bank == "unknown") continue;
            var score = mapping.All.Count(variants => variants.Any(v => set.Contains(v.ToLowerInvariant())));
            if (score > best.Item2) best = (bank, score);
        }
        return best.Item2 >= 3 ? best.Item1 : "unknown";
    }

    private static int FindColumn(IReadOnlyList<string> headers, IEnumerable<string> variants)
    {
        foreach (var v in variants)
            for (var i = 0; i < headers.Count; i++)
                if (string.Equals(headers[i].Trim(), v, StringComparison.OrdinalIgnoreCase)) return i;
        return -1;
    }

    // ── main ─────────────────────────────────────────────────────────────────

    public static BankCsvParseResult Parse(string csvContent)
    {
        var errors = new List<string>();
        var allLines = csvContent.Split('\n').Select(l => l.TrimEnd('\r')).ToArray();
        var skipped = 0;

        // 1. header row
        var headerIndex = -1;
        List<string> headers = [];
        for (var i = 0; i < Math.Min(allLines.Length, 15); i++)
        {
            var fields = ParseCsvLine(allLines[i]);
            var nonEmpty = fields.Where(f => f.Length > 0).ToList();
            if (nonEmpty.Count >= 4 && nonEmpty.Any(f => DateHeader().IsMatch(f)) && nonEmpty.Any(f => DescHeader().IsMatch(f)))
            {
                headerIndex = i;
                headers = fields;
                break;
            }
            skipped++;
        }
        if (headerIndex < 0)
            return Fail("Could not detect header row. Ensure the CSV has columns like 'Date' and 'Description'.", "unknown", [], skipped);

        // 2. bank + 3. columns
        var bank = DetectBankFormat(headers);
        var map = BankMappings[bank];
        int dateCol = FindColumn(headers, map.Date), valueDateCol = FindColumn(headers, map.ValueDate),
            descCol = FindColumn(headers, map.Description), refCol = FindColumn(headers, map.Reference),
            chequeCol = FindColumn(headers, map.Cheque), debitCol = FindColumn(headers, map.Debit),
            creditCol = FindColumn(headers, map.Credit), balanceCol = FindColumn(headers, map.Balance),
            amountCol = debitCol < 0 && creditCol < 0 ? FindColumn(headers, ["Amount", "Transaction Amount"]) : -1;
        if (dateCol < 0 || descCol < 0)
            return Fail("Required columns missing: need at least Date and Description.", bank, headers, skipped);

        // 4. rows
        var lines = new List<ParsedBankLine>();
        DateOnly? min = null, max = null;
        decimal totalDebits = 0, totalCredits = 0;

        for (var i = headerIndex + 1; i < allLines.Length; i++)
        {
            var raw = allLines[i].Trim();
            if (raw.Length == 0) continue;
            var fields = ParseCsvLine(raw);
            if (fields.Count < 3) continue;

            var date = ParseDate(At(fields, dateCol));
            if (date is null) { skipped++; continue; }              // footers, totals, blank date rows
            var description = At(fields, descCol).Trim();
            if (description.Length == 0) { skipped++; continue; }

            var debit = debitCol >= 0 ? Math.Abs(ParseAmount(At(fields, debitCol))) : 0m;
            var credit = creditCol >= 0 ? Math.Abs(ParseAmount(At(fields, creditCol))) : 0m;
            if (amountCol >= 0)
            {
                var amount = ParseAmount(At(fields, amountCol));
                if (amount < 0) { debit = -amount; credit = 0m; } else { debit = 0m; credit = amount; }
            }

            var rawData = new Dictionary<string, string>();
            for (var h = 0; h < headers.Count && h < fields.Count; h++)
                if (headers[h].Length > 0) rawData[headers[h]] = fields[h];

            totalDebits += debit; totalCredits += credit;
            if (min is null || date < min) min = date;
            if (max is null || date > max) max = date;

            lines.Add(new ParsedBankLine(
                date.Value,
                valueDateCol >= 0 ? ParseDate(At(fields, valueDateCol)) : null,
                description,
                NullIfEmpty(refCol >= 0 ? At(fields, refCol) : null),
                NullIfEmpty(chequeCol >= 0 ? At(fields, chequeCol) : null),
                Math.Round(debit, 2, MidpointRounding.AwayFromZero),
                Math.Round(credit, 2, MidpointRounding.AwayFromZero),
                balanceCol >= 0 && At(fields, balanceCol).Trim().Length > 0 ? Math.Round(ParseAmount(At(fields, balanceCol)), 2, MidpointRounding.AwayFromZero) : null,
                rawData));
        }

        if (lines.Count == 0) errors.Add("No valid transaction rows found in the CSV.");

        return new BankCsvParseResult(lines.Count > 0, bank, lines, headers, skipped, errors, min, max,
            Math.Round(totalDebits, 2), Math.Round(totalCredits, 2));

        static string At(List<string> f, int i) => i >= 0 && i < f.Count ? f[i] : string.Empty;
        static string? NullIfEmpty(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
        static BankCsvParseResult Fail(string error, string bank, List<string> headers, int skipped) =>
            new(false, bank, [], headers, skipped, [error], null, null, 0m, 0m);
    }
}
