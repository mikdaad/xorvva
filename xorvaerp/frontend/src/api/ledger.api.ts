import client from './client';
import type { ApiResponse } from './auth.api';

/* ═══════════════════════════════════════════════════════════════
   TrueLedge-port API client (Phase 3). Backs the voucher entry
   screen, cost centres, bank statement import, AI document inbox
   and the SQL-computed ledger reports. Mirrors the C# DTOs under
   Xorva.Modules.Accounting/DTOs/{Voucher,CostCentre,BankImport,
   DocumentInbox}Dtos.cs — keep the two in step.
   ═══════════════════════════════════════════════════════════════ */

const q = (o: object) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));

// ─── Vouchers ───────────────────────────────────────────────────

export type VoucherType =
  | 'SalesInvoice' | 'PurchaseBill' | 'CreditNote' | 'DebitNote'
  | 'Receipt' | 'Payment' | 'Journal' | 'Contra' | 'OpeningBalance';
export type VoucherStatus = 'Draft' | 'Submitted' | 'Posted' | 'Reversed' | 'Cancelled';
export type VoucherMode = 'Settlement' | 'Journal' | 'Invoice';
export type TradeDirection = 'Inward' | 'Outward';

export interface VoucherTypeInfo {
  type: VoucherType;
  shortcut: string;           // "F4".."F9" or "" for non-entry types
  label: string;
  description: string;
  mode: VoucherMode;
  requiresParty: boolean;
  direction?: TradeDirection | null;
  prefix: string;
}

export interface VoucherEntryLine {
  accountId: string;
  productId?: string | null;
  description?: string | null;
  drCr?: 'DR' | 'CR';
  amount?: number;
  quantity?: number;
  unitPrice?: number;
  discountPct?: number;
  taxRateId?: string | null;
  costCentreId?: string | null;
}

export interface SaveVoucherRequest {
  companyId?: string;
  voucherId?: string;
  voucherType: VoucherType;
  voucherDate: string;
  dueDate?: string | null;
  supplyDate?: string | null;
  contactId?: string | null;
  currency?: string;
  exchangeRate?: number;
  reference?: string;
  narration?: string;
  placeOfSupply?: string;
  lines: VoucherEntryLine[];
  saveAsDraft?: boolean;
}

export interface VoucherLine {
  id: string;
  lineNumber: number;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  productId?: string;
  description?: string;
  drCr: 'DR' | 'CR';
  quantity: number;
  unitPrice: number;
  discountPct: number;
  lineAmount: number;
  taxRateId?: string;
  taxRatePercent: number;
  taxAmount: number;
  lineTotal: number;
  baseLineTotal: number;
  costCentreId?: string;
  costCentreName?: string;
}

export interface Voucher {
  id: string;
  companyId: string;
  voucherType: VoucherType;
  voucherNumber: string;
  status: VoucherStatus;
  contactId?: string;
  contactName?: string;
  voucherDate: string;
  dueDate?: string;
  supplyDate?: string;
  currency: string;
  exchangeRate: number;
  subTotal: number;
  discountTotal: number;
  taxTotal: number;
  totalAmount: number;
  baseTotalAmount: number;
  amountPaid: number;
  amountDue?: number;
  reference?: string;
  narration?: string;
  placeOfSupply?: string;
  buyerTrn?: string;
  sellerTrn?: string;
  journalEntryId?: string;
  entryNumber?: string;
  postedAt?: string;
  reversedById?: string;
  reversalOfId?: string;
  reversalReason?: string;
  createdAt: string;
  lines: VoucherLine[];
}

export interface VoucherRegisterRow {
  id: string;
  companyId: string;
  voucherDate: string;
  voucherNumber: string;
  voucherType: VoucherType;
  status: VoucherStatus;
  contactName?: string;
  reference?: string;
  narration?: string;
  currency: string;
  totalAmount: number;
  baseTotalAmount: number;
  amountDue?: number;
  journalEntryId?: string;
  entryNumber?: string;
  createdByName?: string;
  createdAt: string;
}

export interface VoucherRegister {
  rows: VoucherRegisterRow[];
  totalCount: number;
  totalBaseAmount: number;
  limit: number;
  offset: number;
}

export interface VoucherFilters {
  companyId?: string;
  from?: string;
  to?: string;
  type?: VoucherType | '';
  status?: VoucherStatus | '';
  contactId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

// ─── Cost centres ───────────────────────────────────────────────

export type CostCentreDimensionType = 'Project' | 'Department' | 'Location' | 'Activity' | 'Segment' | 'Custom';
export const DIMENSION_TYPES: CostCentreDimensionType[] = ['Department', 'Project', 'Location', 'Activity', 'Segment', 'Custom'];

export interface CostCentreDimension {
  id: string;
  dimensionType: CostCentreDimensionType;
  name: string;
  code: string;
  description?: string;
  isMandatory: boolean;
  isActive: boolean;
  sortOrder: number;
  costCentreCount: number;
}

export interface CostCentre {
  id: string;
  dimensionId: string;
  dimensionName?: string;
  code: string;
  name: string;
  parentId?: string;
  level: number;
  isGroup: boolean;
  isActive: boolean;
  budget?: number;
  startDate?: string;
  endDate?: string;
}

export interface CostCentreReportRow {
  costCentreId: string;
  dimensionId: string;
  dimensionName: string;
  code: string;
  name: string;
  parentId?: string;
  level: number;
  isGroup: boolean;
  debit: number;
  credit: number;
  net: number;
  lineCount: number;
  budget?: number;
  variance?: number;
}

export interface CostCentreReport {
  from?: string;
  to?: string;
  dimensionId?: string;
  rows: CostCentreReportRow[];
  totalDebit: number;
  totalCredit: number;
  totalNet: number;
}

// ─── Bank statements ────────────────────────────────────────────

export type BankImportStatus = 'Pending' | 'Processing' | 'Completed' | 'Failed' | 'PartiallyCompleted';
export type BankMatchStatus = 'Unmatched' | 'Suggested' | 'Matched' | 'Ignored';
export type BankMatchPatternField = 'Description' | 'Reference' | 'ChequeNumber';

export interface BankCsvPreviewLine {
  lineDate: string; valueDate?: string; description: string; reference?: string; chequeNumber?: string;
  debit: number; credit: number; balance?: number;
}
export interface BankCsvPreview {
  success: boolean;
  bankFormat: string;
  headers: string[];
  lineCount: number;
  skippedRows: number;
  errors: string[];
  periodFrom?: string;
  periodTo?: string;
  totalDebits: number;
  totalCredits: number;
  sample: BankCsvPreviewLine[];
}

export interface BankStatement {
  id: string;
  bankAccountId: string;
  bankAccountName?: string;
  statementDate?: string;
  periodFrom: string;
  periodTo: string;
  openingBalance?: number;
  closingBalance?: number;
  totalDebits: number;
  totalCredits: number;
  lineCount: number;
  sourceFile?: string;
  sourceFormat?: string;
  importStatus: BankImportStatus;
  importErrors?: string;
  importedAt: string;
  matchedCount: number;
  suggestedCount: number;
  unmatchedCount: number;
  ignoredCount: number;
}

export interface BankStatementLine {
  id: string;
  statementId: string;
  lineNumber: number;
  lineDate: string;
  valueDate?: string;
  description: string;
  reference?: string;
  chequeNumber?: string;
  debit: number;
  credit: number;
  balance?: number;
  matchStatus: BankMatchStatus;
  matchedJournalLineId?: string;
  matchedVoucherId?: string;
  matchedEntryNumber?: string;
  matchedDescription?: string;
  matchRuleId?: string;
  matchRuleName?: string;
  suggestedAccountId?: string;
  suggestedAccountName?: string;
  suggestedContactId?: string;
  matchedAt?: string;
}

export interface BankStatementDetail { statement: BankStatement; lines: BankStatementLine[]; }

export interface BankMatchCandidate {
  journalLineId: string; journalEntryId: string; entryNumber: string; date: string;
  description?: string; debit: number; credit: number; contactId?: string;
}

export interface BankMatchRule {
  id: string;
  ruleName: string;
  description?: string;
  pattern: string;
  patternField: BankMatchPatternField;
  targetAccountId?: string;
  targetContactId?: string;
  targetVoucherType?: VoucherType;
  priority: number;
  isActive: boolean;
  timesUsed: number;
  lastUsedAt?: string;
}

export interface BankMatchRuleInput {
  companyId?: string;
  ruleName: string;
  description?: string;
  pattern: string;
  patternField: BankMatchPatternField;
  targetAccountId?: string | null;
  targetContactId?: string | null;
  targetVoucherType?: VoucherType | null;
  priority: number;
  isActive: boolean;
}

// ─── AI document inbox ──────────────────────────────────────────

export type InboxDocumentStatus = 'Pending' | 'Processing' | 'Extracted' | 'Accepted' | 'Rejected' | 'Failed';
export type DocumentKind = 'PurchaseInvoice' | 'SalesInvoice' | 'Receipt' | 'Other';

export interface InboxDocument {
  id: string;
  fileId: string;
  fileName: string;
  mimeType: string;
  fileSize?: number;
  pageCount?: number;
  tags: string[];
  status: InboxDocumentStatus;
  statusMessage?: string;
  documentKind: DocumentKind;
  createdVoucherId?: string;
  createdVoucherNumber?: string;
  uploadedAt: string;
  uploadedBy?: string;
  processedAt?: string;
  confidenceScore?: number;
  supplierName?: string;
  invoiceNumber?: string;
  grandTotal?: number;
}

export interface DocumentFieldSuggestion {
  id: string;
  fieldName: string;
  fieldGroup?: string;
  extractedValue?: string;
  confidence: number;
  confidenceLevel: string;
  userOverride?: string;
  finalValue?: string;
}

/** Shape of `extractedData` (Gemini INVOICE_SCHEMA, snake_case — kept verbatim from TrueLedge). */
export interface ExtractedInvoice {
  supplier_name?: string; supplier_trn?: string; buyer_name?: string; buyer_trn?: string;
  invoice_number?: string; invoice_date?: string; due_date?: string; currency?: string;
  place_of_supply?: string; matched_party_id?: string | null; document_type?: string;
  line_items?: {
    description?: string; quantity?: number; unit_price?: number; tax_rate?: number; amount?: number;
    confidence?: number; matched_item_id?: string | null; matched_account_id?: string | null;
  }[];
  subtotal?: number; tax_total?: number; grand_total?: number; overall_confidence?: number;
  field_confidence?: Record<string, number>;
}

export interface DocumentExtraction {
  id: string;
  documentId: string;
  modelUsed: string;
  modelVersion?: string;
  processingTimeMs?: number;
  extractedData: ExtractedInvoice;
  confidenceScore: number;
  confidenceLevel: string;
  isAccepted: boolean;
  acceptedAt?: string;
  createdVoucherId?: string;
  fields: DocumentFieldSuggestion[];
}

export interface InboxDocumentDetail {
  document: InboxDocument;
  extraction?: DocumentExtraction | null;
  extractionAvailable: boolean;
}

export interface InboxList {
  rows: InboxDocument[];
  totalCount: number;
  statusCounts: Record<string, number>;
}

// ─── Ledger reports (SQL) — camelCase shapes from TrueLedge reports/types.ts ──

export interface BalanceSheetNode {
  id: string; name: string; code: string | null; isGroup: boolean; amount: number;
  drillAccountId: string | null; children: BalanceSheetNode[];
}
export interface LedgerBalanceSheet {
  entityId: string; entityName: string; baseCurrency: string; asOf: string;
  assets: { total: number; nodes: BalanceSheetNode[] };
  liabilities: { total: number; nodes: BalanceSheetNode[] };
  equity: { total: number; nodes: BalanceSheetNode[] };
  retainedEarnings: number; totalAssets: number; totalLiabilitiesAndEquity: number; difference: number;
}
export interface LedgerStatementLine {
  date: string; entryNumber: string; narration: string | null; debit: number; credit: number; runningBalance: number;
  journalEntryId?: string; voucherId?: string | null; voucherNumber?: string | null; costCentre?: string | null;
}
export interface LedgerStatement {
  entityId: string; entityName: string; baseCurrency: string;
  accountId: string; accountName: string; accountCode: string | null; accountType?: string; normalBalance?: string;
  from: string | null; to: string | null; costCentreId?: string | null;
  openingBalance: number; lines: LedgerStatementLine[]; totalDebit: number; totalCredit: number; closingBalance: number;
}
export interface LedgerTrialBalanceRow {
  accountId: string; code: string; name: string; accountType: string; accountSubType: string; isGroup: boolean;
  openingDebit: number; openingCredit: number; periodDebit: number; periodCredit: number; closingDebit: number; closingCredit: number;
}
export interface BankReconciliationSummary {
  bankAccountId: string; bankAccountName?: string; glAccountId?: string; asOf: string;
  ledgerBalance: number; lastStatementClosingBalance?: number | null; reconciledBalance?: number;
  statementLines?: { matched: number; suggested: number; unmatched: number; ignored: number };
  unreconciledLedgerLines?: number; statementNetMovement?: number;
}

export type ExportReportType = 'BalanceSheet' | 'Ledger' | 'Transactions' | 'TrialBalance';
export type ExportFormat = 'Pdf' | 'Xlsx';

// ─── Products (Commerce master, exposed under api/accounting/products) ──

export interface Product {
  id: string; name: string; code?: string; salesPrice: number;
  salesAccountId?: string; taxRateId?: string; description?: string; isActive: boolean;
}

// ─── Client ─────────────────────────────────────────────────────

const form = (fields: Record<string, unknown>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null || v === '') continue;
    fd.append(k, v instanceof Blob ? v : String(v));
  }
  return fd;
};
const multipart = { headers: { 'Content-Type': 'multipart/form-data' } };

export const ledgerApi = {
  listProducts: (companyId?: string, includeInactive = false) =>
    client.get<ApiResponse<Product[]>>('/accounting/products', { params: q({ companyId, includeInactive }) }),

  // Vouchers
  voucherTypes: () => client.get<ApiResponse<VoucherTypeInfo[]>>('/accounting/vouchers/types'),
  listVouchers: (f: VoucherFilters) => client.get<ApiResponse<VoucherRegister>>('/accounting/vouchers', { params: q(f) }),
  getVoucher: (id: string, companyId?: string) =>
    client.get<ApiResponse<Voucher>>(`/accounting/vouchers/${id}`, { params: q({ companyId }) }),
  saveVoucher: (data: SaveVoucherRequest) => client.post<ApiResponse<Voucher>>('/accounting/vouchers', data),
  reverseVoucher: (id: string, data: { companyId?: string; reason: string; reversalDate?: string }) =>
    client.post<ApiResponse<Voucher>>(`/accounting/vouchers/${id}/reverse`, data),
  cancelVoucher: (id: string, companyId?: string) =>
    client.post<ApiResponse<Voucher>>(`/accounting/vouchers/${id}/cancel`, { companyId }),

  // Cost centres
  listDimensions: (companyId?: string, includeInactive = false) =>
    client.get<ApiResponse<CostCentreDimension[]>>('/accounting/cost-centres/dimensions', { params: q({ companyId, includeInactive }) }),
  saveDimension: (data: Partial<CostCentreDimension> & { companyId?: string }) =>
    data.id
      ? client.put<ApiResponse<CostCentreDimension>>(`/accounting/cost-centres/dimensions/${data.id}`, data)
      : client.post<ApiResponse<CostCentreDimension>>('/accounting/cost-centres/dimensions', data),
  listCostCentres: (companyId?: string, dimensionId?: string, includeInactive = false, leavesOnly = false) =>
    client.get<ApiResponse<CostCentre[]>>('/accounting/cost-centres', { params: q({ companyId, dimensionId, includeInactive, leavesOnly }) }),
  saveCostCentre: (data: Partial<CostCentre> & { companyId?: string; dimensionId: string }) =>
    data.id
      ? client.put<ApiResponse<CostCentre>>(`/accounting/cost-centres/${data.id}`, data)
      : client.post<ApiResponse<CostCentre>>('/accounting/cost-centres', data),
  deleteCostCentre: (id: string, companyId?: string) =>
    client.delete<ApiResponse<never>>(`/accounting/cost-centres/${id}`, { params: q({ companyId }) }),
  costCentreReport: (companyId?: string, dimensionId?: string, from?: string, to?: string) =>
    client.get<ApiResponse<CostCentreReport>>('/accounting/cost-centres/report', { params: q({ companyId, dimensionId, from, to }) }),

  // Bank statements
  listStatements: (companyId?: string, bankAccountId?: string) =>
    client.get<ApiResponse<BankStatement[]>>('/accounting/bank-statements', { params: q({ companyId, bankAccountId }) }),
  getStatement: (id: string, companyId?: string, status?: BankMatchStatus | '') =>
    client.get<ApiResponse<BankStatementDetail>>(`/accounting/bank-statements/${id}`, { params: q({ companyId, status }) }),
  previewStatement: (file: File, companyId?: string) =>
    client.post<ApiResponse<BankCsvPreview>>('/accounting/bank-statements/preview', form({ file, companyId }), multipart),
  importStatement: (data: { file: File; bankAccountId: string; companyId?: string; statementDate?: string; openingBalance?: string; closingBalance?: string }) =>
    client.post<ApiResponse<BankStatementDetail>>('/accounting/bank-statements/import', form(data), multipart),
  suggestMatches: (id: string, companyId?: string) =>
    client.post<ApiResponse<BankStatementDetail>>(`/accounting/bank-statements/${id}/suggest`, null, { params: q({ companyId }) }),
  matchCandidates: (lineId: string, companyId?: string, windowDays = 30, exactAmount = true) =>
    client.get<ApiResponse<BankMatchCandidate[]>>(`/accounting/bank-statements/lines/${lineId}/candidates`, { params: q({ companyId, windowDays, exactAmount }) }),
  confirmMatch: (lineId: string, journalLineId: string, companyId?: string) =>
    client.post<ApiResponse<BankStatementLine>>(`/accounting/bank-statements/lines/${lineId}/confirm`, { companyId, action: 'Confirm', journalLineId }),
  unmatchLine: (lineId: string, companyId?: string) =>
    client.post<ApiResponse<BankStatementLine>>(`/accounting/bank-statements/lines/${lineId}/unmatch`, null, { params: q({ companyId }) }),
  ignoreLine: (lineId: string, companyId?: string) =>
    client.post<ApiResponse<BankStatementLine>>(`/accounting/bank-statements/lines/${lineId}/ignore`, null, { params: q({ companyId }) }),
  listRules: (companyId?: string) =>
    client.get<ApiResponse<BankMatchRule[]>>('/accounting/bank-statements/rules', { params: q({ companyId }) }),
  saveRule: (data: BankMatchRuleInput & { id?: string }) =>
    data.id
      ? client.put<ApiResponse<BankMatchRule>>(`/accounting/bank-statements/rules/${data.id}`, data)
      : client.post<ApiResponse<BankMatchRule>>('/accounting/bank-statements/rules', data),
  deleteRule: (id: string, companyId?: string) =>
    client.delete<ApiResponse<never>>(`/accounting/bank-statements/rules/${id}`, { params: q({ companyId }) }),

  // Document inbox
  listDocuments: (f: { companyId?: string; status?: InboxDocumentStatus | ''; kind?: DocumentKind | ''; search?: string; limit?: number; offset?: number }) =>
    client.get<ApiResponse<InboxList>>('/accounting/documents', { params: q(f) }),
  getDocument: (id: string, companyId?: string) =>
    client.get<ApiResponse<InboxDocumentDetail>>(`/accounting/documents/${id}`, { params: q({ companyId }) }),
  documentFileUrl: (id: string, companyId?: string) =>
    `/api/accounting/documents/${id}/file${companyId ? `?companyId=${companyId}` : ''}`,
  fetchDocumentFile: (id: string, companyId?: string) =>
    client.get<Blob>(`/accounting/documents/${id}/file`, { params: q({ companyId }), responseType: 'blob' }),
  uploadDocument: (data: { file: File; companyId?: string; documentKind: DocumentKind; tags?: string; extractNow?: boolean }) =>
    client.post<ApiResponse<InboxDocumentDetail>>('/accounting/documents', form(data), multipart),
  extractDocument: (id: string, companyId?: string) =>
    client.post<ApiResponse<InboxDocumentDetail>>(`/accounting/documents/${id}/extract`, null, { params: q({ companyId }) }),
  overrideField: (id: string, fieldName: string, value: string | null, companyId?: string) =>
    client.put<ApiResponse<InboxDocumentDetail>>(`/accounting/documents/${id}/fields`, { companyId, fieldName, value }),
  acceptDocument: (id: string, voucherId: string, companyId?: string) =>
    client.post<ApiResponse<InboxDocumentDetail>>(`/accounting/documents/${id}/accept`, { companyId, voucherId }),
  rejectDocument: (id: string, reason?: string, companyId?: string) =>
    client.post<ApiResponse<InboxDocumentDetail>>(`/accounting/documents/${id}/reject`, { companyId, reason }),

  // Ledger reports (SQL)
  balanceSheet: (companyId?: string, asOf?: string) =>
    client.get<ApiResponse<LedgerBalanceSheet>>('/accounting/ledger-reports/balance-sheet', { params: q({ companyId, asOf }) }),
  trialBalance: (companyId?: string, from?: string, to?: string) =>
    client.get<ApiResponse<LedgerTrialBalanceRow[]>>('/accounting/ledger-reports/trial-balance', { params: q({ companyId, from, to }) }),
  ledgerStatement: (accountId: string, companyId?: string, from?: string, to?: string, costCentreId?: string) =>
    client.get<ApiResponse<LedgerStatement>>(`/accounting/ledger-reports/ledger-statement/${accountId}`, { params: q({ companyId, from, to, costCentreId }) }),
  bankReconciliationSummary: (bankAccountId: string, companyId?: string, asOf?: string) =>
    client.get<ApiResponse<BankReconciliationSummary>>(`/accounting/ledger-reports/bank-reconciliation/${bankAccountId}`, { params: q({ companyId, asOf }) }),

  /** Downloads a PDF/XLSX export and triggers the browser save dialog. */
  exportReport: async (params: {
    reportType: ExportReportType; format: ExportFormat; companyId?: string; asOf?: string; accountId?: string;
    from?: string; to?: string; voucherType?: VoucherType | ''; status?: VoucherStatus | ''; contactId?: string; costCentreId?: string; search?: string;
  }) => {
    const res = await client.get<Blob>('/accounting/ledger-reports/export', { params: q(params), responseType: 'blob' });
    const cd = String(res.headers['content-disposition'] ?? '');
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
    const name = m ? decodeURIComponent(m[1]) : `${params.reportType}.${params.format === 'Xlsx' ? 'xlsx' : 'pdf'}`;
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },

  // Period close (graded) — extends the existing fiscal-years endpoint
  setPeriodCloseStatus: (id: string, closeStatus: 'Open' | 'SoftClosed' | 'HardClosed', companyId?: string) =>
    client.put<ApiResponse<{ id: string; closeStatus: string; isClosed: boolean }>>(`/accounting/fiscal-years/periods/${id}`, { closeStatus, companyId }),
};

// ─── Shared helpers for the ported pages ────────────────────────

export const fmtMoney = (n: number | null | undefined, digits = 2) =>
  (n ?? 0).toLocaleString('en-AE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const todayIso = () => new Date().toISOString().slice(0, 10);

export const VOUCHER_STATUS_TONE: Record<VoucherStatus, 'neutral' | 'brand' | 'ok' | 'warn' | 'bad'> = {
  Draft: 'warn', Submitted: 'brand', Posted: 'ok', Reversed: 'neutral', Cancelled: 'bad',
};
