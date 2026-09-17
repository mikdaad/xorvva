import * as XLSX from "xlsx";
import type {
  BalanceSheetResult,
  BalanceSheetNode,
  LedgerStatement,
  TransactionRegisterResult,
} from "@/lib/reports/types";
import { formatReportDate } from "@/lib/reports/labels";

/**
 * Generates an XLSX file Buffer for transactions (Daybook), Balance Sheet, or Ledger statements.
 */
export function generateReportXLSX(
  reportType: "balance_sheet" | "ledger" | "transactions",
  data: BalanceSheetResult | LedgerStatement | TransactionRegisterResult
): Buffer {
  const wb = XLSX.utils.book_new();

  if (reportType === "transactions") {
    buildTransactionsSheet(wb, data as TransactionRegisterResult);
  } else if (reportType === "balance_sheet") {
    buildBalanceSheetSheet(wb, data as BalanceSheetResult);
  } else if (reportType === "ledger") {
    buildLedgerSheet(wb, data as LedgerStatement);
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return buf as Buffer;
}

// ---------------------------------------------------------------------------
// 1. Transactions Register Sheet (Daybook)
// ---------------------------------------------------------------------------

function buildTransactionsSheet(wb: XLSX.WorkBook, data: TransactionRegisterResult) {
  const sheetData: any[][] = [];

  // Header banner rows
  sheetData.push([data.entityName]);
  sheetData.push(["Transaction Register (Daybook)"]);
  sheetData.push([`Base Currency: ${data.baseCurrency}`]);
  sheetData.push([]); // Empty row

  // Table header
  sheetData.push([
    "Date",
    "Voucher No",
    "Type",
    "Party Name",
    "Reference",
    "Status",
    "Currency",
    `Base Amount (${data.baseCurrency})`,
    "Created By",
  ]);

  // Data rows
  for (const row of data.rows) {
    sheetData.push([
      formatReportDate(row.date),
      row.voucherNumber,
      row.typeLabel,
      row.partyName || "—",
      row.reference || "—",
      row.statusLabel,
      row.currency,
      Number(row.baseAmount || 0), // Numeric cell type
      row.createdBy || "—",
    ]);
  }

  // Summary row
  sheetData.push([
    "Total",
    "",
    "",
    "",
    "",
    "",
    "",
    Number(data.totalBaseAmount || 0),
    "",
  ]);

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Apply column widths
  ws["!cols"] = [
    { wch: 14 }, // Date
    { wch: 18 }, // Voucher No
    { wch: 16 }, // Type
    { wch: 25 }, // Party Name
    { wch: 25 }, // Reference
    { wch: 12 }, // Status
    { wch: 10 }, // Currency
    { wch: 18 }, // Base Amount
    { wch: 20 }, // Created By
  ];

  // Apply number formatting to numeric cells in column H (Base Amount)
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1:I1");
  for (let R = 5; R <= range.e.r; ++R) {
    const cellRef = XLSX.utils.encode_cell({ r: R, c: 7 });
    if (ws[cellRef] && typeof ws[cellRef].v === "number") {
      ws[cellRef].t = "n";
      ws[cellRef].z = "#,##0.00";
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, "Transactions");
}

// ---------------------------------------------------------------------------
// 2. Balance Sheet Sheet
// ---------------------------------------------------------------------------

function buildBalanceSheetSheet(wb: XLSX.WorkBook, data: BalanceSheetResult) {
  const sheetData: any[][] = [];

  sheetData.push([data.entityName]);
  sheetData.push(["Balance Sheet"]);
  sheetData.push([`As Of: ${formatReportDate(data.asOf)} | Base Currency: ${data.baseCurrency}`]);
  sheetData.push([]);

  sheetData.push(["Account Code", "Account / Group Name", `Amount (${data.baseCurrency})`]);

  // Recursively append tree nodes
  function appendNode(node: BalanceSheetNode, indentLevel: number = 0) {
    const indentStr = "  ".repeat(indentLevel);
    sheetData.push([
      node.code || "",
      `${indentStr}${node.name}`,
      Number(node.amount || 0),
    ]);
    if (node.children) {
      for (const child of node.children) {
        appendNode(child, indentLevel + 1);
      }
    }
  }

  // Section 1: Assets
  sheetData.push(["", "ASSETS", ""]);
  for (const node of data.assets.nodes) {
    appendNode(node, 1);
  }
  sheetData.push(["", "TOTAL ASSETS", Number(data.totalAssets || 0)]);
  sheetData.push([]);

  // Section 2: Liabilities
  sheetData.push(["", "LIABILITIES", ""]);
  for (const node of data.liabilities.nodes) {
    appendNode(node, 1);
  }
  sheetData.push(["", "TOTAL LIABILITIES", Number(data.liabilities.total || 0)]);
  sheetData.push([]);

  // Section 3: Equity
  sheetData.push(["", "EQUITY & CAPITAL", ""]);
  for (const node of data.equity.nodes) {
    appendNode(node, 1);
  }
  sheetData.push(["", "TOTAL EQUITY", Number(data.equity.total || 0)]);
  sheetData.push([]);

  // Summary Totals
  sheetData.push(["", "TOTAL LIABILITIES & EQUITY", Number(data.totalLiabilitiesAndEquity || 0)]);
  sheetData.push(["", "NET DIFFERENCE", Number(data.difference || 0)]);

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  ws["!cols"] = [
    { wch: 15 }, // Code
    { wch: 45 }, // Name
    { wch: 20 }, // Amount
  ];

  // Apply number formatting to amount column
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1:C1");
  for (let R = 4; R <= range.e.r; ++R) {
    const cellRef = XLSX.utils.encode_cell({ r: R, c: 2 });
    if (ws[cellRef] && typeof ws[cellRef].v === "number") {
      ws[cellRef].t = "n";
      ws[cellRef].z = "#,##0.00";
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, "Balance Sheet");
}

// ---------------------------------------------------------------------------
// 3. Ledger Statement Sheet
// ---------------------------------------------------------------------------

function buildLedgerSheet(wb: XLSX.WorkBook, data: LedgerStatement) {
  const sheetData: any[][] = [];

  sheetData.push([data.entityName]);
  sheetData.push([`Ledger Statement: ${data.accountName} (${data.accountCode || "No Code"})`]);
  sheetData.push([`Period: ${formatReportDate(data.from)} to ${formatReportDate(data.to)} | Currency: ${data.baseCurrency}`]);
  sheetData.push([]);

  sheetData.push(["Date", "Entry No", "Narration", "Debit", "Credit", "Running Balance"]);

  // Opening balance row
  sheetData.push([
    data.from ? formatReportDate(data.from) : "—",
    "OPENING",
    "Opening Balance Brought Forward",
    data.openingBalance > 0 ? Number(data.openingBalance) : 0,
    data.openingBalance < 0 ? Number(Math.abs(data.openingBalance)) : 0,
    Number(data.openingBalance),
  ]);

  for (const line of data.lines) {
    sheetData.push([
      formatReportDate(line.date),
      line.entryNumber,
      line.narration || "—",
      Number(line.debit || 0),
      Number(line.credit || 0),
      Number(line.runningBalance || 0),
    ]);
  }

  // Summary row
  sheetData.push([
    "Closing",
    "",
    "Total & Closing Balance",
    Number(data.totalDebit || 0),
    Number(data.totalCredit || 0),
    Number(data.closingBalance || 0),
  ]);

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  ws["!cols"] = [
    { wch: 14 },
    { wch: 18 },
    { wch: 35 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
  ];

  const range = XLSX.utils.decode_range(ws["!ref"] || "A1:F1");
  for (let R = 5; R <= range.e.r; ++R) {
    for (const C of [3, 4, 5]) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      if (ws[cellRef] && typeof ws[cellRef].v === "number") {
        ws[cellRef].t = "n";
        ws[cellRef].z = "#,##0.00";
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, "Ledger");
}
