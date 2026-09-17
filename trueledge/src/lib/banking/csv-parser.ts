/**
 * UAE Bank Statement CSV Parser
 *
 * Handles messy CSV exports from major UAE banks:
 * - ENBD (Emirates NBD)
 * - ADCB (Abu Dhabi Commercial Bank)
 * - FAB (First Abu Dhabi Bank)
 * - Mashreq
 * - RAK (RAK Bank)
 * - DIB (Dubai Islamic Bank)
 *
 * Features:
 * - Quote-aware parsing (handles commas inside quoted fields)
 * - Merged header row detection (skips bank name/address headers)
 * - Auto-detects bank format from header patterns
 * - Normalizes dates, amounts, and negative formats
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedBankLine {
  line_date: string;        // ISO date string (YYYY-MM-DD)
  value_date: string | null;
  description: string;
  reference: string | null;
  cheque_number: string | null;
  debit: number;
  credit: number;
  balance: number | null;
  raw_data: Record<string, string>;  // Original CSV row as key-value
}

export interface ParseResult {
  success: boolean;
  bank_format: string | null;
  lines: ParsedBankLine[];
  headers: string[];
  skipped_rows: number;
  errors: string[];
  period_from: string | null;
  period_to: string | null;
  total_debits: number;
  total_credits: number;
}

export type BankFormat = "enbd" | "adcb" | "fab" | "mashreq" | "rak" | "dib" | "unknown";

// ---------------------------------------------------------------------------
// Bank-specific column mappings
// ---------------------------------------------------------------------------

interface ColumnMapping {
  date: string[];
  value_date: string[];
  description: string[];
  reference: string[];
  cheque: string[];
  debit: string[];
  credit: string[];
  balance: string[];
}

const BANK_MAPPINGS: Record<BankFormat, ColumnMapping> = {
  enbd: {
    date: ["Date", "Transaction Date", "Txn Date", "Posting Date"],
    value_date: ["Value Date"],
    description: ["Description", "Narrative", "Transaction Description", "Particulars"],
    reference: ["Reference", "Ref No", "Reference Number"],
    cheque: ["Cheque No", "Cheque Number", "Chq No"],
    debit: ["Debit", "Debit Amount", "Withdrawal", "DR"],
    credit: ["Credit", "Credit Amount", "Deposit", "CR"],
    balance: ["Balance", "Running Balance", "Closing Balance"],
  },
  adcb: {
    date: ["Transaction Date", "Date", "Txn Date"],
    value_date: ["Value Date", "Val Date"],
    description: ["Description", "Transaction Details", "Narrative"],
    reference: ["Reference No", "Ref", "Reference"],
    cheque: ["Cheque No"],
    debit: ["Debit", "Withdrawals", "DR Amount"],
    credit: ["Credit", "Deposits", "CR Amount"],
    balance: ["Balance", "Available Balance"],
  },
  fab: {
    date: ["Date", "Transaction Date", "Posted Date"],
    value_date: ["Value Date"],
    description: ["Description", "Details", "Narrative"],
    reference: ["Reference", "Transaction Reference"],
    cheque: ["Cheque No", "Instrument No"],
    debit: ["Debit", "Debit Amount"],
    credit: ["Credit", "Credit Amount"],
    balance: ["Balance", "Ledger Balance"],
  },
  mashreq: {
    date: ["Date", "Posting Date", "Transaction Date"],
    value_date: ["Value Date"],
    description: ["Description", "Transaction Description", "Narration"],
    reference: ["Reference", "Ref No"],
    cheque: ["Cheque No"],
    debit: ["Debit", "Amount Debited"],
    credit: ["Credit", "Amount Credited"],
    balance: ["Balance"],
  },
  rak: {
    date: ["Transaction Date", "Date"],
    value_date: ["Value Date"],
    description: ["Description", "Particulars"],
    reference: ["Reference Number", "Reference"],
    cheque: ["Cheque Number"],
    debit: ["Debit", "Withdrawal"],
    credit: ["Credit", "Deposit"],
    balance: ["Balance", "Running Balance"],
  },
  dib: {
    date: ["Date", "Transaction Date"],
    value_date: ["Value Date"],
    description: ["Description", "Narrative", "Transaction Narrative"],
    reference: ["Reference", "Ref"],
    cheque: ["Cheque No"],
    debit: ["Debit", "Dr"],
    credit: ["Credit", "Cr"],
    balance: ["Balance"],
  },
  unknown: {
    date: ["Date", "Transaction Date", "Txn Date", "Posting Date", "Posted Date"],
    value_date: ["Value Date", "Val Date"],
    description: ["Description", "Narrative", "Details", "Particulars", "Transaction Description"],
    reference: ["Reference", "Ref", "Reference No", "Ref No"],
    cheque: ["Cheque No", "Cheque Number", "Chq No"],
    debit: ["Debit", "Debit Amount", "Withdrawal", "DR", "Dr"],
    credit: ["Credit", "Credit Amount", "Deposit", "CR", "Cr"],
    balance: ["Balance", "Running Balance", "Closing Balance"],
  },
};

// ---------------------------------------------------------------------------
// CSV Parsing (Quote-aware)
// ---------------------------------------------------------------------------

/**
 * Parse a CSV string with proper quote handling.
 * Handles: quoted fields with commas, escaped quotes (""), and newlines in quotes.
 */
export function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i += 2;
          continue;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        current += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === ",") {
        fields.push(current.trim());
        current = "";
        i++;
      } else {
        current += char;
        i++;
      }
    }
  }
  fields.push(current.trim());

  return fields;
}

// ---------------------------------------------------------------------------
// Date Parsing
// ---------------------------------------------------------------------------

const DATE_PATTERNS: Array<{ regex: RegExp; parser: (m: RegExpMatchArray) => string }> = [
  // DD/MM/YYYY or DD-MM-YYYY
  {
    regex: /^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/,
    parser: (m) => `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`,
  },
  // YYYY-MM-DD
  {
    regex: /^(\d{4})-(\d{2})-(\d{2})$/,
    parser: (m) => `${m[1]}-${m[2]}-${m[3]}`,
  },
  // DD-MMM-YYYY (e.g. 15-Jan-2026)
  {
    regex: /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/,
    parser: (m) => {
      const months: Record<string, string> = {
        jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
        jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
      };
      const mon = months[m[2].toLowerCase()] ?? "01";
      return `${m[3]}-${mon}-${m[1].padStart(2, "0")}`;
    },
  },
  // DD MMM YYYY (e.g. 15 Jan 2026)
  {
    regex: /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/,
    parser: (m) => {
      const months: Record<string, string> = {
        jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
        jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
      };
      const mon = months[m[2].toLowerCase()] ?? "01";
      return `${m[3]}-${mon}-${m[1].padStart(2, "0")}`;
    },
  },
];

export function parseDate(value: string): string | null {
  const trimmed = value.trim();
  for (const { regex, parser } of DATE_PATTERNS) {
    const match = trimmed.match(regex);
    if (match) return parser(match);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Amount Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a monetary amount from messy bank CSV formats.
 * Handles: (1,234.56), -1234.56, 1,234.56 CR, DR 1234.56, blank = 0
 */
export function parseAmount(value: string): number {
  if (!value || value.trim() === "" || value.trim() === "-") return 0;

  let s = value.trim();
  let negative = false;

  // Handle parentheses for negatives: (1,234.56)
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  }

  // Handle DR/CR suffixes
  if (/\s*DR\s*$/i.test(s)) {
    negative = true;
    s = s.replace(/\s*DR\s*$/i, "");
  }
  if (/\s*CR\s*$/i.test(s)) {
    s = s.replace(/\s*CR\s*$/i, "");
  }

  // Handle leading minus
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }

  // Remove currency symbols and thousands separators
  s = s.replace(/[AED$€£¥,\s]/g, "");

  const num = parseFloat(s);
  if (isNaN(num)) return 0;

  return negative ? -Math.abs(num) : Math.abs(num);
}

// ---------------------------------------------------------------------------
// Header Detection
// ---------------------------------------------------------------------------

/**
 * Detect which bank format a CSV matches based on header patterns.
 */
function detectBankFormat(headers: string[]): BankFormat {
  const headerSet = new Set(headers.map((h) => h.toLowerCase().trim()));

  // Score each bank based on how many of its expected columns match
  const scores: Array<[BankFormat, number]> = [];

  for (const [bank, mapping] of Object.entries(BANK_MAPPINGS) as Array<[BankFormat, ColumnMapping]>) {
    if (bank === "unknown") continue;
    let score = 0;
    for (const variants of Object.values(mapping)) {
      for (const v of variants) {
        if (headerSet.has(v.toLowerCase())) {
          score++;
          break;
        }
      }
    }
    scores.push([bank, score]);
  }

  scores.sort((a, b) => b[1] - a[1]);

  // Need at least 3 columns matching (date + description + debit or credit)
  if (scores[0] && scores[0][1] >= 3) {
    return scores[0][0];
  }

  return "unknown";
}

/**
 * Find the matching column name from a list of variants.
 */
function findColumn(headers: string[], variants: string[]): string | null {
  for (const variant of variants) {
    const match = headers.find((h) => h.toLowerCase().trim() === variant.toLowerCase());
    if (match) return match;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main Parser
// ---------------------------------------------------------------------------

/**
 * Parse a UAE bank statement CSV file.
 *
 * @param csvContent - Raw CSV file content as string
 * @returns ParseResult with parsed lines, detected bank, and metadata
 */
export function parseBankStatementCSV(csvContent: string): ParseResult {
  const errors: string[] = [];
  const allLines = csvContent.split(/\r?\n/);
  let skippedRows = 0;

  // Step 1: Find the header row
  // Skip bank name, address, and other merged header rows.
  // The header row is the first row with >= 4 non-empty columns that contains
  // known column names like "Date", "Description", "Debit", "Credit".
  let headerRowIndex = -1;
  let headers: string[] = [];

  for (let i = 0; i < Math.min(allLines.length, 15); i++) {
    const fields = parseCSVLine(allLines[i]);
    const nonEmpty = fields.filter((f) => f.trim() !== "");

    if (nonEmpty.length >= 4) {
      // Check if this looks like a header row
      const hasDate = nonEmpty.some((f) =>
        /^(date|transaction date|txn date|posting date|posted date)$/i.test(f.trim())
      );
      const hasDesc = nonEmpty.some((f) =>
        /^(description|narrative|details|particulars|transaction description)$/i.test(f.trim())
      );

      if (hasDate && hasDesc) {
        headerRowIndex = i;
        headers = fields.map((f) => f.trim());
        break;
      }
    }
    skippedRows++;
  }

  if (headerRowIndex === -1) {
    return {
      success: false,
      bank_format: null,
      lines: [],
      headers: [],
      skipped_rows: skippedRows,
      errors: ["Could not detect header row. Ensure the CSV has columns like 'Date' and 'Description'."],
      period_from: null,
      period_to: null,
      total_debits: 0,
      total_credits: 0,
    };
  }

  // Step 2: Detect bank format
  const bankFormat = detectBankFormat(headers);
  const mapping = BANK_MAPPINGS[bankFormat];

  // Step 3: Map columns
  const dateCol = findColumn(headers, mapping.date);
  const valueDateCol = findColumn(headers, mapping.value_date);
  const descCol = findColumn(headers, mapping.description);
  const refCol = findColumn(headers, mapping.reference);
  const chequeCol = findColumn(headers, mapping.cheque);
  const debitCol = findColumn(headers, mapping.debit);
  const creditCol = findColumn(headers, mapping.credit);
  const balanceCol = findColumn(headers, mapping.balance);

  if (!dateCol || !descCol) {
    return {
      success: false,
      bank_format: bankFormat,
      lines: [],
      headers,
      skipped_rows: skippedRows,
      errors: ["Required columns missing: need at least Date and Description."],
      period_from: null,
      period_to: null,
      total_debits: 0,
      total_credits: 0,
    };
  }

  // Step 4: Parse data rows
  const parsedLines: ParsedBankLine[] = [];
  let minDate: string | null = null;
  let maxDate: string | null = null;
  let totalDebits = 0;
  let totalCredits = 0;

  for (let i = headerRowIndex + 1; i < allLines.length; i++) {
    const rawLine = allLines[i].trim();
    if (!rawLine) continue;

    const fields = parseCSVLine(rawLine);
    if (fields.length < 3) continue;

    // Build raw_data object
    const rawData: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (idx < fields.length) rawData[h] = fields[idx];
    });

    // Extract values
    const dateIdx = headers.indexOf(dateCol);
    const dateStr = dateIdx >= 0 ? fields[dateIdx] : "";
    const parsedDate = parseDate(dateStr);

    if (!parsedDate) {
      // Skip rows that don't have a valid date (footers, summaries, etc.)
      skippedRows++;
      continue;
    }

    const descIdx = descCol ? headers.indexOf(descCol) : -1;
    const description = descIdx >= 0 ? fields[descIdx]?.trim() ?? "" : "";

    if (!description) {
      skippedRows++;
      continue;
    }

    const valueDateIdx = valueDateCol ? headers.indexOf(valueDateCol) : -1;
    const valueDate = valueDateIdx >= 0 ? parseDate(fields[valueDateIdx] ?? "") : null;

    const refIdx = refCol ? headers.indexOf(refCol) : -1;
    const reference = refIdx >= 0 ? fields[refIdx]?.trim() || null : null;

    const chequeIdx = chequeCol ? headers.indexOf(chequeCol) : -1;
    const chequeNumber = chequeIdx >= 0 ? fields[chequeIdx]?.trim() || null : null;

    const debitIdx = debitCol ? headers.indexOf(debitCol) : -1;
    const debit = debitIdx >= 0 ? Math.abs(parseAmount(fields[debitIdx] ?? "")) : 0;

    const creditIdx = creditCol ? headers.indexOf(creditCol) : -1;
    const credit = creditIdx >= 0 ? Math.abs(parseAmount(fields[creditIdx] ?? "")) : 0;

    const balanceIdx = balanceCol ? headers.indexOf(balanceCol) : -1;
    const balance = balanceIdx >= 0 ? parseAmount(fields[balanceIdx] ?? "") : null;

    // If there's a single "Amount" column, determine debit/credit from sign
    let finalDebit = debit;
    let finalCredit = credit;
    if (!debitCol && !creditCol) {
      // Look for a generic "Amount" column
      const amountCol = findColumn(headers, ["Amount", "Transaction Amount"]);
      if (amountCol) {
        const amountIdx = headers.indexOf(amountCol);
        const amount = parseAmount(fields[amountIdx] ?? "");
        if (amount < 0) {
          finalDebit = Math.abs(amount);
          finalCredit = 0;
        } else {
          finalDebit = 0;
          finalCredit = amount;
        }
      }
    }

    totalDebits += finalDebit;
    totalCredits += finalCredit;

    // Track date range
    if (!minDate || parsedDate < minDate) minDate = parsedDate;
    if (!maxDate || parsedDate > maxDate) maxDate = parsedDate;

    parsedLines.push({
      line_date: parsedDate,
      value_date: valueDate,
      description,
      reference,
      cheque_number: chequeNumber,
      debit: Math.round(finalDebit * 10000) / 10000,
      credit: Math.round(finalCredit * 10000) / 10000,
      balance: balance !== null ? Math.round(balance * 10000) / 10000 : null,
      raw_data: rawData,
    });
  }

  if (parsedLines.length === 0) {
    errors.push("No valid transaction rows found in the CSV.");
  }

  return {
    success: parsedLines.length > 0,
    bank_format: bankFormat,
    lines: parsedLines,
    headers,
    skipped_rows: skippedRows,
    errors,
    period_from: minDate,
    period_to: maxDate,
    total_debits: Math.round(totalDebits * 10000) / 10000,
    total_credits: Math.round(totalCredits * 10000) / 10000,
  };
}
