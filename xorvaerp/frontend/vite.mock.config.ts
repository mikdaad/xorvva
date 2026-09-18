// Throwaway: design-preview server with an in-memory API mock. Not used by the real app.
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const ok = (data: unknown, message?: string) => ({ success: true, data, message });
const user = { id: 'u1', email: 'amira@alnoor.ae', firstName: 'Amira', lastName: 'Haddad', fullName: 'Amira Haddad', role: 'SuperAdmin', tenantId: 't1', isActive: true, createdAt: '2026-01-01' };
const companies = [
  { id: 'c1', name: 'Al Noor Trading LLC', currency: 'AED', timezone: 'Asia/Dubai', activeModules: ['HR', 'Accounting', 'Sales'], isActive: true, createdAt: '2026-01-01' },
  { id: 'c2', name: 'Noor Logistics FZE', currency: 'AED', timezone: 'Asia/Dubai', activeModules: ['HR', 'Accounting'], isActive: true, createdAt: '2026-01-01' },
];
const acct = (code: string, name: string, accountType: string) => ({ id: `a-${code}`, code, name, accountType, accountSubType: '', normalBalance: 'Debit', isSystemAccount: false, currentBalance: 0, isActive: true, sortOrder: 0 });
const accounts = [acct('1000', 'Cash on hand', 'Asset'), acct('1010', 'ENBD Current Account', 'Asset'), acct('1200', 'Accounts Receivable', 'Asset'), acct('2000', 'Accounts Payable', 'Liability'), acct('2100', 'VAT Payable', 'Liability'), acct('4000', 'Sales Revenue', 'Revenue'), acct('5000', 'Cost of Sales', 'Expense'), acct('6100', 'Rent', 'Expense'), acct('6200', 'Utilities', 'Expense'), acct('6300', 'Salaries', 'Expense')];
const contacts = [
  { id: 'p1', code: 'CUST-001', name: 'Emaar Facilities', contactType: 'Customer', taxNumber: '100234567800003', paymentTermDays: 30, outstandingBalance: 42000, isActive: true },
  { id: 'p2', code: 'SUP-001', name: 'DEWA', contactType: 'Supplier', paymentTermDays: 0, outstandingBalance: 0, isActive: true },
  { id: 'p3', code: 'SUP-002', name: 'Gulf Office Supplies', contactType: 'Supplier', paymentTermDays: 15, outstandingBalance: 3800, isActive: true },
];
const taxRates = [{ id: 'tx1', name: 'Standard VAT', rate: 5, appliesTo: 'Both', isActive: true }, { id: 'tx0', name: 'Zero-rated', rate: 0, appliesTo: 'Both', isActive: true }];
const types = [
  { type: 'Contra', shortcut: 'F4', label: 'Contra', description: 'Move money between cash and bank ledgers.', mode: 'Settlement', requiresParty: false, prefix: 'CTR' },
  { type: 'Payment', shortcut: 'F5', label: 'Payment', description: 'Pay a supplier or an expense out of cash / bank.', mode: 'Settlement', requiresParty: false, direction: 'Inward', prefix: 'PAY' },
  { type: 'Receipt', shortcut: 'F6', label: 'Receipt', description: 'Receive money from a customer into cash / bank.', mode: 'Settlement', requiresParty: false, direction: 'Outward', prefix: 'RCT' },
  { type: 'Journal', shortcut: 'F7', label: 'Journal', description: 'Any balanced adjustment between ledgers.', mode: 'Journal', requiresParty: false, prefix: 'JV' },
  { type: 'SalesInvoice', shortcut: 'F8', label: 'Sales', description: 'Bill a customer — items, VAT and receivable in one go.', mode: 'Invoice', requiresParty: true, direction: 'Outward', prefix: 'INV' },
  { type: 'PurchaseBill', shortcut: 'F9', label: 'Purchase', description: 'Record a supplier bill with input VAT.', mode: 'Invoice', requiresParty: true, direction: 'Inward', prefix: 'BILL' },
];
const vrow = (i: number, t: string, n: string, status: string, party: string | undefined, amt: number, narr: string) => ({
  id: `v${i}`, companyId: 'c1', voucherDate: `2026-09-${String(18 - i).padStart(2, '0')}`, voucherNumber: n, voucherType: t, status, contactName: party, reference: i % 2 ? `REF-${1000 + i}` : undefined, narration: narr, currency: 'AED', totalAmount: amt, baseTotalAmount: amt, entryNumber: status === 'Posted' ? `JE-2026-${String(400 + i).padStart(5, '0')}` : undefined, createdAt: '2026-09-18T08:00:00Z',
});
const vouchers = [
  vrow(1, 'SalesInvoice', 'INV-2026-00042', 'Posted', 'Emaar Facilities', 26250, 'Facility management — September'),
  vrow(2, 'Payment', 'PAY-2026-00118', 'Posted', 'DEWA', 4820.5, 'Electricity & water — Aug'),
  vrow(3, 'Receipt', 'RCT-2026-00077', 'Posted', 'Emaar Facilities', 15750, 'Part payment INV-00039'),
  vrow(4, 'Journal', 'JV-2026-00012', 'Draft', undefined, 12000, 'Accrue September rent'),
  vrow(5, 'PurchaseBill', 'BILL-2026-00061', 'Posted', 'Gulf Office Supplies', 3990, 'Stationery & toner'),
  vrow(6, 'Contra', 'CTR-2026-00009', 'Posted', undefined, 50000, 'Cash deposit to ENBD'),
  vrow(7, 'Payment', 'PAY-2026-00117', 'Reversed', 'Gulf Office Supplies', 1200, 'Duplicate — reversed'),
  vrow(8, 'SalesInvoice', 'INV-2026-00041', 'Submitted', 'Emaar Facilities', 8400, 'Ad-hoc call-out'),
];
const dashboard = {
  role: 'SuperAdmin', pendingApprovalCount: 3,
  pendingApprovals: [
    { id: 'ap1', title: 'Post voucher — Accrue September rent (AED 12,000)', requesterEmail: 'faisal@alnoor.ae', createdAt: '2026-09-18' },
    { id: 'ap2', title: 'Leave request — 3 days annual', requesterEmail: 'mariam@alnoor.ae', createdAt: '2026-09-17' },
    { id: 'ap3', title: 'Reverse voucher — PAY-2026-00117', requesterEmail: 'faisal@alnoor.ae', createdAt: '2026-09-17' },
  ],
  companyCount: 2, totalEmployees: 148,
  companies: [{ id: 'c1', name: 'Al Noor Trading LLC', employeeCount: 112, modules: ['HR', 'Accounting', 'Sales'] }, { id: 'c2', name: 'Noor Logistics FZE', employeeCount: 36, modules: ['HR', 'Accounting'] }],
  employeeCount: 112, departmentCount: 9, onLeaveToday: 4,
  recentHires: [{ fullName: 'Yousef Karim', departmentName: 'Operations', createdAt: '2026-09-15' }, { fullName: 'Lina Saab', departmentName: 'Finance', createdAt: '2026-09-11' }, { fullName: 'Omar Nasser', departmentName: 'Sales', createdAt: '2026-09-03' }],
};
const finance = { cashPosition: 412380.25, accountsReceivable: 186400, accountsPayable: 74210.5, revenueYtd: 1842300, expensesYtd: 1311050, netProfitYtd: 531250, overdueCount: 3, overdueAmount: 28400, openInvoicesCount: 14, revenueTrend: ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].map((m, i) => ({ month: m, revenue: [180, 205, 198, 240, 262, 291][i] * 1000 })) };
const statements = [
  { id: 's1', bankAccountId: 'b1', bankAccountName: 'ENBD Current', periodFrom: '2026-09-01', periodTo: '2026-09-15', totalDebits: 48210.5, totalCredits: 91750, lineCount: 42, sourceFile: 'enbd_sep_1-15.csv', sourceFormat: 'EmiratesNBD', importStatus: 'Completed', importedAt: '2026-09-16T09:00:00Z', matchedCount: 31, suggestedCount: 6, unmatchedCount: 4, ignoredCount: 1 },
  { id: 's2', bankAccountId: 'b1', bankAccountName: 'ENBD Current', periodFrom: '2026-08-16', periodTo: '2026-08-31', totalDebits: 63400, totalCredits: 70120, lineCount: 51, sourceFile: 'enbd_aug_16-31.csv', sourceFormat: 'EmiratesNBD', importStatus: 'Completed', importedAt: '2026-09-01T09:00:00Z', matchedCount: 51, suggestedCount: 0, unmatchedCount: 0, ignoredCount: 0 },
];
const dims = [{ id: 'd1', dimensionType: 'Department', name: 'Department', code: 'DEPT', isMandatory: true, isActive: true, sortOrder: 0, costCentreCount: 5 }, { id: 'd2', dimensionType: 'Project', name: 'Project', code: 'PRJ', isMandatory: false, isActive: true, sortOrder: 1, costCentreCount: 3 }];
const ccs = [
  { id: 'cc1', dimensionId: 'd1', dimensionName: 'Department', code: 'OPS', name: 'Operations', level: 1, isGroup: true, isActive: true },
  { id: 'cc2', dimensionId: 'd1', dimensionName: 'Department', code: 'OPS-FLT', name: 'Fleet', parentId: 'cc1', level: 2, isGroup: false, isActive: true, budget: 120000 },
  { id: 'cc3', dimensionId: 'd1', dimensionName: 'Department', code: 'OPS-WH', name: 'Warehouse', parentId: 'cc1', level: 2, isGroup: false, isActive: true, budget: 80000 },
  { id: 'cc4', dimensionId: 'd1', dimensionName: 'Department', code: 'FIN', name: 'Finance', level: 1, isGroup: false, isActive: true, budget: 60000 },
  { id: 'cc5', dimensionId: 'd1', dimensionName: 'Department', code: 'SAL', name: 'Sales', level: 1, isGroup: false, isActive: false, budget: 95000 },
  { id: 'cc6', dimensionId: 'd2', dimensionName: 'Project', code: 'P-EMAAR', name: 'Emaar FM contract', level: 1, isGroup: false, isActive: true, budget: 400000 },
];

const routes: [RegExp, (m: RegExpMatchArray, url: URL) => unknown][] = [
  [/^\/auth\/me$/, () => ok(user)],
  [/^\/auth\/login$/, () => ok({ accessToken: 'x', refreshToken: 'y', user })],
  [/^\/companies$/, () => ok(companies)],
  [/^\/tenants\/current$/, () => ok({ id: 't1', name: 'Al Noor Group', contactEmail: 'amira@alnoor.ae', isActive: true, createdAt: '2026-01-01', companyCount: 2, onboardedAt: '2026-01-02' })],
  [/^\/platform\/entity-definitions$/, () => ok([])],
  [/^\/approvals\/pending$/, () => ok(dashboard.pendingApprovals)],
  [/^\/dashboard$/, () => ok(dashboard)],
  [/^\/accounting\/dashboard$/, () => ok(finance)],
  [/^\/accounting\/my-access$/, () => ok({ hasAccountingAccess: true })],
  [/^\/accounting\/accounts$/, () => ok(accounts)],
  [/^\/accounting\/contacts$/, () => ok(contacts)],
  [/^\/accounting\/tax-rates$/, () => ok(taxRates)],
  [/^\/accounting\/products$/, () => ok([{ id: 'pr1', name: 'FM service — monthly', code: 'FM-M', salesPrice: 25000, salesAccountId: 'a-4000', taxRateId: 'tx1', isActive: true }])],
  [/^\/accounting\/cost-centres\/dimensions$/, () => ok(dims)],
  [/^\/accounting\/cost-centres$/, () => ok(ccs)],
  [/^\/accounting\/vouchers\/types$/, () => ok(types)],
  [/^\/accounting\/vouchers$/, () => ok({ rows: vouchers, totalCount: vouchers.length, totalBaseAmount: vouchers.reduce((a, v) => a + v.totalAmount, 0), limit: 50, offset: 0 })],
  [/^\/accounting\/bank-accounts$/, () => ok([{ id: 'b1', name: 'ENBD Current', accountId: 'a-1010', bankName: 'Emirates NBD', isActive: true }])],
  [/^\/accounting\/bank-statements$/, () => ok(statements)],
  [/^\/accounting\/documents$/, () => ok({ rows: [], totalCount: 0, statusCounts: {} })],
  [/^\/accounting\/fiscal-years$/, () => ok([{ id: 'fy', name: 'FY2026', startDate: '2026-01-01', endDate: '2026-12-31', isClosed: false, periods: Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, name: `2026-${i + 1}`, startDate: `2026-${String(i + 1).padStart(2, '0')}-01`, endDate: `2026-${String(i + 1).padStart(2, '0')}-28`, isClosed: i < 8, closeStatus: i < 6 ? 'HardClosed' : i < 8 ? 'SoftClosed' : 'Open' })) }])],
];

const mock: Plugin = {
  name: 'xorva-mock',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/api/')) return next();
      const url = new URL(req.url, 'http://x');
      const path = url.pathname.replace(/^\/api/, '');
      for (const [re, fn] of routes) {
        const m = path.match(re);
        if (m) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(fn(m, url))); return; }
      }
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(ok(null)));
    });
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), mock],
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true },
});
