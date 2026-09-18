import client from './client';
import type { ApiResponse } from './auth.api';

// ─── Types ──────────────────────────────────────────────────────

export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
export type NormalBalance = 'Debit' | 'Credit';

export interface Account {
  id: string;
  code: string;
  name: string;
  accountType: AccountType;
  accountSubType: string;
  normalBalance: NormalBalance;
  parentAccountId?: string;
  description?: string;
  isSystemAccount: boolean;
  currentBalance: number;
  isActive: boolean;
  sortOrder: number;
}

export const ACCOUNTING_INDUSTRIES = ['General', 'Trading', 'Construction', 'Staffing', 'Software'];

export const ACCOUNT_TYPES: AccountType[] = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];

/** Subtypes the user can choose from, grouped by type (matches the backend enum). */
export const SUBTYPES_BY_TYPE: Record<AccountType, string[]> = {
  Asset: ['Bank', 'Cash', 'AccountsReceivable', 'TaxReceivable', 'Inventory', 'OtherCurrentAsset', 'FixedAsset', 'OtherAsset'],
  Liability: ['AccountsPayable', 'TaxPayable', 'OtherCurrentLiability', 'LongTermLiability'],
  Equity: ['Equity', 'RetainedEarnings'],
  Revenue: ['Revenue', 'OtherIncome'],
  Expense: ['CostOfGoodsSold', 'OperatingExpense', 'OtherExpense'],
};

/** Turns "AccountsReceivable" into "Accounts Receivable" for display. */
export const humanizeSubType = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2');

// ─── Journals ───────────────────────────────────────────────────

export interface JournalLine {
  id: string;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  debit: number;
  credit: number;
  description?: string;
}

export interface JournalEntry {
  id: string;
  entryNumber: string;
  date: string;
  description: string;
  sourceType: string;
  status: string;
  totalDebit: number;
  totalCredit: number;
  lines: JournalLine[];
}

export interface JournalSummary {
  id: string;
  entryNumber: string;
  date: string;
  description: string;
  sourceType: string;
  status: string;
  totalDebit: number;
  totalCredit: number;
}

export interface ManualJournalLineInput {
  accountId: string;
  debit: number;
  credit: number;
  description?: string;
}

// ─── Trial Balance ──────────────────────────────────────────────

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  accountType: string;
  debit: number;
  credit: number;
}

export interface TrialBalance {
  asOf: string;
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
}

// ─── Statements ─────────────────────────────────────────────────

export interface StatementRow { code: string; name: string; amount: number; }

export interface ProfitAndLoss {
  from: string;
  to: string;
  revenue: StatementRow[];
  totalRevenue: number;
  expenses: StatementRow[];
  totalExpenses: number;
  netProfit: number;
}

export interface BalanceSheet {
  asOf: string;
  assets: StatementRow[];
  totalAssets: number;
  liabilities: StatementRow[];
  totalLiabilities: number;
  equity: StatementRow[];
  totalEquity: number;
  currentYearEarnings: number;
  isBalanced: boolean;
}

export interface CashFlowRow { category: string; amount: number; }
export interface CashFlow {
  from: string;
  to: string;
  openingCash: number;
  totalInflows: number;
  totalOutflows: number;
  netChange: number;
  closingCash: number;
  activities: CashFlowRow[];
}

export interface MonthlyPoint { month: string; revenue: number; }

export interface FinanceDashboard {
  cashPosition: number;
  accountsReceivable: number;
  accountsPayable: number;
  revenueYtd: number;
  expensesYtd: number;
  netProfitYtd: number;
  overdueCount: number;
  overdueAmount: number;
  openInvoicesCount: number;
  revenueTrend: MonthlyPoint[];
}

export interface AgedRow {
  contactId: string;
  contactName: string;
  current: number;
  days1To30: number;
  days31To60: number;
  days61To90: number;
  days90Plus: number;
  total: number;
}

export interface AgedReceivables { asOf: string; rows: AgedRow[]; totals: AgedRow; }

export interface GlLine {
  date: string;
  entryNumber: string;
  description: string;
  debit: number;
  credit: number;
  running: number;
}

export interface GeneralLedger {
  accountId: string;
  code: string;
  name: string;
  opening: number;
  lines: GlLine[];
  closing: number;
}

// ─── Contacts / Tax / Bank ──────────────────────────────────────

export type ContactType = 'Customer' | 'Supplier' | 'Both';

export interface Contact {
  id: string;
  code: string;
  name: string;
  contactType: ContactType;
  taxNumber?: string;
  email?: string;
  phone?: string;
  paymentTermDays: number;
  outstandingBalance: number;
  isActive: boolean;
}

export interface TaxRate {
  id: string;
  name: string;
  rate: number;
  appliesTo: string;
  isActive: boolean;
}

export interface BankAccount {
  id: string;
  name: string;
  accountId: string;
  bankName?: string;
  accountNumber?: string;
  iban?: string;
  isActive: boolean;
}

// ─── Bank reconciliation ────────────────────────────────────────

export interface BankReconLine {
  id: string;
  date: string;
  entryNumber: string;
  description?: string;
  debit: number;
  credit: number;
  isReconciled: boolean;
}

export interface BankReconciliation {
  bankAccountId: string;
  bankAccountName: string;
  ledgerBalance: number;
  reconciledBalance: number;
  unreconciledBalance: number;
  lines: BankReconLine[];
}

// ─── Invoices ───────────────────────────────────────────────────

export interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  accountId: string;
  taxRateId?: string;
  taxRatePercent: number;
  lineAmount: number;
  lineTax: number;
}

export interface Invoice {
  id: string;
  number: string;
  contactId: string;
  contactName?: string;
  date: string;
  dueDate: string;
  status: string;
  currency: string;
  exchangeRate: number;
  subTotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  baseTotal: number;
  journalEntryId?: string;
  notes?: string;
  lines: InvoiceLine[];
}

export interface InvoiceSummary {
  id: string;
  number: string;
  contactId: string;
  contactName?: string;
  date: string;
  dueDate: string;
  status: string;
  currency: string;
  total: number;
  balanceDue: number;
}

export interface InvoiceLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  accountId?: string;
  taxRateId?: string;
}

// ─── Payments ───────────────────────────────────────────────────

export interface CustomerPayment {
  id: string;
  number: string;
  contactId: string;
  contactName?: string;
  date: string;
  amount: number;
  currency: string;
  exchangeRate: number;
  bankAccountId: string;
  method: string;
  reference?: string;
  allocations: { invoiceId: string; amount: number }[];
}

export const PAYMENT_METHODS = ['Bank', 'Cash', 'Cheque', 'Card', 'Online'];

// ─── Bills / Supplier payments ──────────────────────────────────

export interface BillLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  accountId: string;
  taxRateId?: string;
  taxRatePercent: number;
  lineAmount: number;
  lineTax: number;
}

export interface Bill {
  id: string;
  number: string;
  supplierReference?: string;
  contactId: string;
  contactName?: string;
  date: string;
  dueDate: string;
  status: string;
  currency: string;
  exchangeRate: number;
  subTotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  baseTotal: number;
  journalEntryId?: string;
  notes?: string;
  lines: BillLine[];
}

export interface BillSummary {
  id: string;
  number: string;
  supplierReference?: string;
  contactId: string;
  contactName?: string;
  date: string;
  dueDate: string;
  status: string;
  currency: string;
  total: number;
  balanceDue: number;
}

export interface BillLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  accountId?: string;
  taxRateId?: string;
}

export interface SupplierPayment {
  id: string;
  number: string;
  contactId: string;
  contactName?: string;
  date: string;
  amount: number;
  currency: string;
  exchangeRate: number;
  method: string;
  reference?: string;
}

// ─── Fiscal years ───────────────────────────────────────────────

export type PeriodCloseStatus = 'Open' | 'SoftClosed' | 'HardClosed';

export interface FiscalPeriod {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isClosed: boolean;
  /** Graded close (TrueLedge port): SoftClosed still lets admins post adjustments. */
  closeStatus?: PeriodCloseStatus;
  closedAt?: string;
}

export interface FiscalYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isClosed: boolean;
  periods: FiscalPeriod[];
}

// ─── Fixed assets ───────────────────────────────────────────────

export interface FixedAsset {
  id: string;
  name: string;
  code?: string;
  category?: string;
  acquisitionDate: string;
  cost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  accumulatedDepreciation: number;
  bookValue: number;
  isDisposed: boolean;
  assetAccountId: string;
  accumulatedDepreciationAccountId: string;
  depreciationExpenseAccountId: string;
}

// ─── Credit notes ───────────────────────────────────────────────

export interface CreditNoteSummary {
  id: string;
  number: string;
  contactId: string;
  contactName?: string;
  date: string;
  status: string;
  total: number;
}

export interface CreditNoteLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  accountId?: string;
  taxRateId?: string;
}

// ─── Debit notes ────────────────────────────────────────────────

export interface DebitNoteSummary {
  id: string;
  number: string;
  contactId: string;
  contactName?: string;
  date: string;
  status: string;
  total: number;
}

export interface DebitNoteLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  accountId?: string;
  taxRateId?: string;
}

// ─── VAT return ─────────────────────────────────────────────────

export interface VatReturn {
  from: string;
  to: string;
  outputVat: number;
  inputVat: number;
  netPayable: number;
}

// ─── Multi-currency ─────────────────────────────────────────────

export interface ExchangeRate {
  id: string;
  currencyCode: string;
  rateDate: string;
  rate: number;
}

export interface FxRevaluationResult {
  asOfDate: string;
  netUnrealized: number;
  posted: boolean;
  journalEntryId?: string;
  reversalEntryId?: string;
  message: string;
}

// ─── E-invoicing (UBL / PINT AE) ────────────────────────────────

export interface EInvoicingSettings {
  legalName?: string | null;
  taxRegistrationNumber?: string | null;
  addressLine?: string | null;
  city?: string | null;
  countryCode: string;
  companyName: string;
}

export interface EInvoice {
  fileName: string;
  format: string;
  xml: string;
  warnings: string[];
}

// ─── API ────────────────────────────────────────────────────────

export interface SalesOverview {
  customerCount: number;
  supplierCount: number;
  openInvoicesCount: number;
  receivables: number;
  overdueInvoicesCount: number;
  overdueAmount: number;
  openBillsCount: number;
  payables: number;
  salesThisMonth: number;
}

export const accountingApi = {
  getSalesOverview: (companyId?: string) =>
    client.get<ApiResponse<SalesOverview>>('/sales/overview', { params: companyId ? { companyId } : undefined }),
  listAccounts: (companyId?: string, includeInactive = false) =>
    client.get<ApiResponse<Account[]>>('/accounting/accounts', {
      params: { includeInactive, ...(companyId ? { companyId } : {}) },
    }),

  createAccount: (data: {
    companyId?: string; code: string; name: string;
    accountType: AccountType; accountSubType: string; description?: string;
  }) => client.post<ApiResponse<Account>>('/accounting/accounts', data),

  updateAccount: (id: string, data: {
    companyId?: string; name: string; description?: string; isActive: boolean;
  }) => client.put<ApiResponse<Account>>(`/accounting/accounts/${id}`, data),

  seedChartOfAccounts: (industry: string, companyId?: string) =>
    client.post<ApiResponse<number>>('/accounting/accounts/seed', { industry, companyId }),
  postOpeningBalances: (data: { companyId?: string; asOf: string; lines: { accountId: string; debit: number; credit: number }[] }) =>
    client.post<ApiResponse<JournalEntry>>('/accounting/accounts/opening-balances', data),

  // Journals
  listJournals: (companyId?: string) =>
    client.get<ApiResponse<JournalSummary[]>>('/accounting/journals', { params: companyId ? { companyId } : undefined }),
  getJournal: (id: string, companyId?: string) =>
    client.get<ApiResponse<JournalEntry>>(`/accounting/journals/${id}`, { params: companyId ? { companyId } : undefined }),
  createManualJournal: (data: { companyId?: string; date: string; description: string; currency?: string; exchangeRate?: number; lines: ManualJournalLineInput[] }) =>
    client.post<ApiResponse<JournalEntry>>('/accounting/journals', data),
  voidJournal: (id: string, data: { companyId?: string; reason?: string }) =>
    client.post<ApiResponse<JournalEntry>>(`/accounting/journals/${id}/void`, data),

  // Reports
  getTrialBalance: (companyId?: string) =>
    client.get<ApiResponse<TrialBalance>>('/accounting/reports/trial-balance', { params: companyId ? { companyId } : undefined }),
  getProfitAndLoss: (companyId?: string, from?: string, to?: string) =>
    client.get<ApiResponse<ProfitAndLoss>>('/accounting/reports/profit-and-loss', {
      params: { ...(companyId ? { companyId } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) },
    }),
  getBalanceSheet: (companyId?: string, asOf?: string) =>
    client.get<ApiResponse<BalanceSheet>>('/accounting/reports/balance-sheet', {
      params: { ...(companyId ? { companyId } : {}), ...(asOf ? { asOf } : {}) },
    }),
  getCashFlow: (companyId?: string, from?: string, to?: string) =>
    client.get<ApiResponse<CashFlow>>('/accounting/reports/cash-flow', {
      params: { ...(companyId ? { companyId } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) },
    }),
  getDashboard: (companyId?: string) =>
    client.get<ApiResponse<FinanceDashboard>>('/accounting/reports/dashboard', { params: companyId ? { companyId } : undefined }),
  getAgedReceivables: (companyId?: string) =>
    client.get<ApiResponse<AgedReceivables>>('/accounting/reports/aged-receivables', { params: companyId ? { companyId } : undefined }),
  getGeneralLedger: (accountId: string, companyId?: string, from?: string, to?: string) =>
    client.get<ApiResponse<GeneralLedger>>('/accounting/reports/general-ledger', {
      params: { accountId, ...(companyId ? { companyId } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) },
    }),

  // Contacts
  listContacts: (companyId?: string, role?: ContactType) =>
    client.get<ApiResponse<Contact[]>>('/accounting/contacts', { params: { ...(companyId ? { companyId } : {}), ...(role ? { role } : {}) } }),
  createContact: (data: Record<string, unknown>) => client.post<ApiResponse<Contact>>('/accounting/contacts', data),
  updateContact: (id: string, data: Record<string, unknown>) => client.put<ApiResponse<Contact>>(`/accounting/contacts/${id}`, data),

  // Tax rates
  listTaxRates: (companyId?: string) =>
    client.get<ApiResponse<TaxRate[]>>('/accounting/tax-rates', { params: companyId ? { companyId } : undefined }),
  seedTaxRates: (companyId?: string) => client.post<ApiResponse<number>>('/accounting/tax-rates/seed', { companyId }),
  createTaxRate: (data: Record<string, unknown>) => client.post<ApiResponse<TaxRate>>('/accounting/tax-rates', data),

  // Bank accounts
  listBankAccounts: (companyId?: string) =>
    client.get<ApiResponse<BankAccount[]>>('/accounting/bank-accounts', { params: companyId ? { companyId } : undefined }),
  createBankAccount: (data: Record<string, unknown>) => client.post<ApiResponse<BankAccount>>('/accounting/bank-accounts', data),
  getBankReconciliation: (bankAccountId: string, companyId?: string) =>
    client.get<ApiResponse<BankReconciliation>>(`/accounting/bank-accounts/${bankAccountId}/reconciliation`, { params: companyId ? { companyId } : undefined }),
  setLineReconciled: (lineId: string, isReconciled: boolean, companyId?: string) =>
    client.put<ApiResponse<boolean>>(`/accounting/bank-accounts/reconciliation/lines/${lineId}`, { isReconciled, companyId }),

  // Invoices
  listInvoices: (companyId?: string) =>
    client.get<ApiResponse<InvoiceSummary[]>>('/accounting/invoices', { params: companyId ? { companyId } : undefined }),
  getInvoice: (id: string, companyId?: string) =>
    client.get<ApiResponse<Invoice>>(`/accounting/invoices/${id}`, { params: companyId ? { companyId } : undefined }),
  createInvoice: (data: { companyId?: string; contactId: string; date: string; dueDate?: string; notes?: string; currency?: string; exchangeRate?: number; lines: InvoiceLineInput[] }) =>
    client.post<ApiResponse<Invoice>>('/accounting/invoices', data),
  postInvoice: (id: string, companyId?: string) =>
    client.post<ApiResponse<Invoice>>(`/accounting/invoices/${id}/post`, {}, { params: companyId ? { companyId } : undefined }),
  voidInvoice: (id: string, data: { companyId?: string; reason?: string }) =>
    client.post<ApiResponse<Invoice>>(`/accounting/invoices/${id}/void`, data),
  getInvoiceEInvoice: (id: string, companyId?: string) =>
    client.get<ApiResponse<EInvoice>>(`/accounting/invoices/${id}/einvoice`, { params: companyId ? { companyId } : undefined }),

  // Exchange rates
  listExchangeRates: (companyId?: string) =>
    client.get<ApiResponse<ExchangeRate[]>>('/accounting/exchange-rates', { params: companyId ? { companyId } : undefined }),
  upsertExchangeRate: (data: { companyId?: string; currencyCode: string; rateDate: string; rate: number }) =>
    client.post<ApiResponse<ExchangeRate>>('/accounting/exchange-rates', data),
  deleteExchangeRate: (id: string, companyId?: string) =>
    client.delete<ApiResponse<boolean>>(`/accounting/exchange-rates/${id}`, { params: companyId ? { companyId } : undefined }),
  revalueFx: (data: { companyId?: string; asOfDate: string }) =>
    client.post<ApiResponse<FxRevaluationResult>>('/accounting/exchange-rates/revalue', data),

  // E-invoicing settings (seller tax identity)
  getEInvoicingSettings: (companyId?: string) =>
    client.get<ApiResponse<EInvoicingSettings>>('/accounting/einvoicing/settings', { params: companyId ? { companyId } : undefined }),
  updateEInvoicingSettings: (data: { companyId?: string; legalName?: string; taxRegistrationNumber?: string; addressLine?: string; city?: string; countryCode: string }) =>
    client.put<ApiResponse<EInvoicingSettings>>('/accounting/einvoicing/settings', data),

  // Credit notes
  listCreditNotes: (companyId?: string) =>
    client.get<ApiResponse<CreditNoteSummary[]>>('/accounting/credit-notes', { params: companyId ? { companyId } : undefined }),
  createCreditNote: (data: { companyId?: string; contactId: string; invoiceId?: string; date: string; reason?: string; lines: CreditNoteLineInput[] }) =>
    client.post<ApiResponse<unknown>>('/accounting/credit-notes', data),

  // Payments
  listPayments: (companyId?: string) =>
    client.get<ApiResponse<CustomerPayment[]>>('/accounting/payments', { params: companyId ? { companyId } : undefined }),
  recordPayment: (data: { companyId?: string; contactId: string; date: string; bankAccountId: string; method: string; reference?: string; currency?: string; exchangeRate?: number; allocations: { invoiceId: string; amount: number }[] }) =>
    client.post<ApiResponse<CustomerPayment>>('/accounting/payments', data),

  // Bills
  listBills: (companyId?: string) =>
    client.get<ApiResponse<BillSummary[]>>('/accounting/bills', { params: companyId ? { companyId } : undefined }),
  getBill: (id: string, companyId?: string) =>
    client.get<ApiResponse<Bill>>(`/accounting/bills/${id}`, { params: companyId ? { companyId } : undefined }),
  createBill: (data: { companyId?: string; contactId: string; date: string; dueDate?: string; supplierReference?: string; notes?: string; currency?: string; exchangeRate?: number; lines: BillLineInput[] }) =>
    client.post<ApiResponse<Bill>>('/accounting/bills', data),
  postBill: (id: string, companyId?: string) =>
    client.post<ApiResponse<Bill>>(`/accounting/bills/${id}/post`, {}, { params: companyId ? { companyId } : undefined }),
  voidBill: (id: string, data: { companyId?: string; reason?: string }) =>
    client.post<ApiResponse<Bill>>(`/accounting/bills/${id}/void`, data),

  // Supplier payments
  listSupplierPayments: (companyId?: string) =>
    client.get<ApiResponse<SupplierPayment[]>>('/accounting/supplier-payments', { params: companyId ? { companyId } : undefined }),
  recordSupplierPayment: (data: { companyId?: string; contactId: string; date: string; bankAccountId: string; method: string; reference?: string; currency?: string; exchangeRate?: number; allocations: { billId: string; amount: number }[] }) =>
    client.post<ApiResponse<SupplierPayment>>('/accounting/supplier-payments', data),

  // Debit notes
  listDebitNotes: (companyId?: string) =>
    client.get<ApiResponse<DebitNoteSummary[]>>('/accounting/debit-notes', { params: companyId ? { companyId } : undefined }),
  createDebitNote: (data: { companyId?: string; contactId: string; billId?: string; date: string; reason?: string; lines: DebitNoteLineInput[] }) =>
    client.post<ApiResponse<unknown>>('/accounting/debit-notes', data),

  // More reports
  getVatReturn: (companyId?: string, from?: string, to?: string) =>
    client.get<ApiResponse<VatReturn>>('/accounting/reports/vat-return', {
      params: { ...(companyId ? { companyId } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) },
    }),
  getAgedPayables: (companyId?: string) =>
    client.get<ApiResponse<AgedReceivables>>('/accounting/reports/aged-payables', { params: companyId ? { companyId } : undefined }),

  // Access (department-function model): does the current user get the Accounting module?
  getMyAccess: () =>
    client.get<ApiResponse<{ hasAccountingAccess: boolean }>>('/accounting/my-access'),

  // Fiscal years / period close
  listFiscalYears: (companyId?: string) =>
    client.get<ApiResponse<FiscalYear[]>>('/accounting/fiscal-years', { params: companyId ? { companyId } : undefined }),
  createFiscalYear: (year: number, companyId?: string) =>
    client.post<ApiResponse<FiscalYear>>('/accounting/fiscal-years', { year, companyId }),
  closeYear: (id: string, companyId?: string) =>
    client.post<ApiResponse<FiscalYear>>(`/accounting/fiscal-years/${id}/close`, {}, { params: companyId ? { companyId } : undefined }),
  setPeriodClosed: (id: string, isClosed: boolean, companyId?: string) =>
    client.put<ApiResponse<FiscalPeriod>>(`/accounting/fiscal-years/periods/${id}`, { isClosed, companyId }),

  // Fixed assets
  listFixedAssets: (companyId?: string) =>
    client.get<ApiResponse<FixedAsset[]>>('/accounting/fixed-assets', { params: companyId ? { companyId } : undefined }),
  createFixedAsset: (data: Record<string, unknown>) =>
    client.post<ApiResponse<FixedAsset>>('/accounting/fixed-assets', data),
  runDepreciation: (data: { companyId?: string; year: number; month: number }) =>
    client.post<ApiResponse<{ assetsDepreciated: number; totalDepreciation: number }>>('/accounting/fixed-assets/run-depreciation', data),
};
