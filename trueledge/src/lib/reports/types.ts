import type { VoucherType, VoucherStatus } from "@/types/database.types";

/**
 * Shared shapes for the reporting + export engine. These are the contract
 * between the server actions (`@/lib/actions/reports`), the report pages, the
 * `/api/reports/export` route, and the XLSX/PDF generators.
 */

export type ReportType = "balance_sheet" | "ledger" | "transactions";
export type ExportFormat = "pdf" | "xlsx";

export interface DateRange {
  from?: string | null;
  to?: string | null;
}

/**
 * The union of every filter any report understands. Each report reads only the
 * fields relevant to it; the export route forwards this object verbatim after
 * re-scoping the tenant server-side.
 */
export interface ReportFilters {
  /** Balance Sheet "as of" date (inclusive). */
  asOf?: string | null;
  /** Ledger drill-down target. */
  accountId?: string | null;
  /** Ledger / transaction register date window. */
  dateRange?: DateRange | null;
  voucherType?: VoucherType | "all" | null;
  status?: VoucherStatus | "all" | null;
  partyId?: string | null;
}

// ---------------------------------------------------------------------------
// Balance Sheet
// ---------------------------------------------------------------------------

export type BalanceSheetSection = "assets" | "liabilities" | "equity";

export interface BalanceSheetNode {
  /** Account id, or a synthetic key for injected / grouping rows. */
  id: string;
  name: string;
  code: string | null;
  isGroup: boolean;
  /** Section-natural positive amount: Dr for assets, Cr for liabilities/equity. */
  amount: number;
  /** Ledger id to drill into, or null for group / synthetic rows. */
  drillAccountId: string | null;
  children: BalanceSheetNode[];
}

export interface BalanceSheetSectionResult {
  total: number;
  nodes: BalanceSheetNode[];
}

export interface BalanceSheetResult {
  entityId: string;
  entityName: string;
  baseCurrency: string;
  asOf: string;
  assets: BalanceSheetSectionResult;
  liabilities: BalanceSheetSectionResult;
  equity: BalanceSheetSectionResult;
  /** Current-period net income (revenue − expense) folded into equity. */
  retainedEarnings: number;
  totalAssets: number;
  totalLiabilitiesAndEquity: number;
  /** totalAssets − totalLiabilitiesAndEquity; ~0 for balanced books. */
  difference: number;
}

// ---------------------------------------------------------------------------
// Ledger statement
// ---------------------------------------------------------------------------

export interface LedgerLine {
  date: string;
  entryNumber: string;
  narration: string | null;
  debit: number;
  credit: number;
  /** Dr-positive running balance after this line. */
  runningBalance: number;
}

export interface LedgerStatement {
  entityId: string;
  entityName: string;
  baseCurrency: string;
  accountId: string;
  accountName: string;
  accountCode: string | null;
  from: string | null;
  to: string | null;
  /** Dr-positive balance brought forward as of `from`. */
  openingBalance: number;
  lines: LedgerLine[];
  totalDebit: number;
  totalCredit: number;
  /** Dr-positive balance carried forward as of `to`. */
  closingBalance: number;
}

// ---------------------------------------------------------------------------
// Unified voucher register (Daybook)
// ---------------------------------------------------------------------------

export interface TransactionRegisterRow {
  id: string;
  date: string;
  voucherNumber: string;
  voucherType: VoucherType;
  typeLabel: string;
  partyName: string | null;
  reference: string | null;
  status: VoucherStatus;
  statusLabel: string;
  currency: string;
  /** Amount converted to the entity base currency (AED). */
  baseAmount: number;
  createdBy: string | null;
}

export interface TransactionRegisterResult {
  entityId: string;
  entityName: string;
  baseCurrency: string;
  filters: ReportFilters;
  rows: TransactionRegisterRow[];
  totalBaseAmount: number;
}
