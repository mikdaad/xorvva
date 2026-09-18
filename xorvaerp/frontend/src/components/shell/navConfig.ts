import {
  IconLayoutDashboard, IconBuilding, IconMapPin, IconUsers, IconBuildingCommunity,
  IconId, IconCalendarStats, IconBeach, IconCalendarEvent, IconInbox, IconChecklist,
  IconHistory, IconUserPlus, IconUsersGroup, IconSettings, IconReportMoney, IconBook2,
  IconBook, IconScale, IconFileInvoice, IconCash, IconReceiptTax, IconBuildingBank,
  IconTrendingUp, IconReportAnalytics, IconClockDollar, IconReceipt2, IconCashBanknote,
  IconAdjustments, IconBuildingWarehouse, IconArrowsExchange, IconArrowBackUp, IconArrowForwardUp,
  IconFileTypeXml, IconCurrencyDollar, IconApps, IconKeyboard, IconListDetails, IconSitemap,
  IconFileImport, IconSparkles, type Icon,
} from '@tabler/icons-react';

export type RoleName = 'SystemAdmin' | 'SuperAdmin' | 'CompanyAdmin' | 'Manager' | 'Employee';

export interface NavItem {
  to: string;
  label: string;
  icon: Icon;
  /** Exactly the roles that may see this item (explicit RBAC — no guessing). */
  roles: RoleName[];
}

export interface NavGroup {
  key: string;
  heading: string;
  icon: Icon;
  /** One-line description shown on the module's Overview page. */
  description?: string;
  items: NavItem[];
  /** If set, the group only shows when the active company has this module activated. */
  module?: string;
  /**
   * If set, visibility follows the department-function access model instead of the per-item
   * role list: the group shows when the user has access to this function (admins, or a
   * Manager who heads a department of this function). Resolved via the module's my-access API.
   */
  functionGate?: 'Accounting';
}

// Convenience role sets
const ADMINS: RoleName[] = ['SuperAdmin', 'CompanyAdmin'];               // company management
const HR_STAFF: RoleName[] = ['SuperAdmin', 'CompanyAdmin', 'Manager'];  // can see employees
const APPROVERS: RoleName[] = ['SuperAdmin', 'CompanyAdmin', 'Manager'];
const SELF_SERVICE: RoleName[] = ['Manager', 'Employee'];               // people who take leave
const ALL_TENANT: RoleName[] = ['SuperAdmin', 'CompanyAdmin', 'Manager', 'Employee'];

/** Standalone top item — every authenticated user has a dashboard. */
export const DASHBOARD: NavItem = {
  to: '/dashboard', label: 'Dashboard', icon: IconLayoutDashboard,
  roles: ['SystemAdmin', 'SuperAdmin', 'CompanyAdmin', 'Manager', 'Employee'],
};

/**
 * Module-based navigation. Business-module groups (module set) appear only when the
 * active company has that module on. Each item lists exactly the roles that may see it,
 * so an item never appears for a role that would be blocked by the API (no dead links,
 * no self-service leave for administrators).
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'hr',
    heading: 'HR',
    icon: IconUsersGroup,
    module: 'HR',
    description: 'Your people — employees, departments, leave and payroll.',
    items: [
      { to: '/hr', label: 'Overview', icon: IconLayoutDashboard, roles: HR_STAFF },
      { to: '/hr/employees', label: 'Employees', icon: IconUsers, roles: HR_STAFF },
      { to: '/hr/departments', label: 'Departments', icon: IconBuildingCommunity, roles: HR_STAFF },
      { to: '/hr/designations', label: 'Designations', icon: IconId, roles: ADMINS },
      { to: '/hr/leave-types', label: 'Leave Types', icon: IconCalendarStats, roles: ADMINS },
      { to: '/hr/holidays', label: 'Holidays', icon: IconCalendarEvent, roles: ALL_TENANT },
      { to: '/hr/payroll', label: 'Payroll', icon: IconCashBanknote, roles: ADMINS },
      { to: '/hr/leave', label: 'My Leave', icon: IconBeach, roles: SELF_SERVICE },
    ],
  },
  {
    // CRM & Sales module (customers/suppliers, invoicing, bills). Gated by the Sales module.
    key: 'sales',
    heading: 'CRM & Sales',
    icon: IconFileInvoice,
    module: 'Sales',
    functionGate: 'Accounting',
    description: 'Customers & suppliers, invoicing, bills, payments and aged reports.',
    items: [
      { to: '/crm', label: 'Overview', icon: IconLayoutDashboard, roles: ADMINS },
      { to: '/accounting/contacts', label: 'Contacts', icon: IconUsers, roles: ADMINS },
      { to: '/accounting/invoices', label: 'Invoices', icon: IconFileInvoice, roles: ADMINS },
      { to: '/accounting/payments', label: 'Payments', icon: IconCash, roles: ADMINS },
      { to: '/accounting/credit-notes', label: 'Credit Notes', icon: IconArrowBackUp, roles: ADMINS },
      { to: '/accounting/bills', label: 'Bills', icon: IconReceipt2, roles: ADMINS },
      { to: '/accounting/supplier-payments', label: 'Supplier Payments', icon: IconCashBanknote, roles: ADMINS },
      { to: '/accounting/debit-notes', label: 'Debit Notes', icon: IconArrowForwardUp, roles: ADMINS },
      { to: '/accounting/aged-receivables', label: 'Aged Receivables', icon: IconClockDollar, roles: ADMINS },
      { to: '/accounting/aged-payables', label: 'Aged Payables', icon: IconClockDollar, roles: ADMINS },
      { to: '/accounting/e-invoicing', label: 'E-Invoicing', icon: IconFileTypeXml, roles: ADMINS },
    ],
  },
  {
    // Accounting = the pure ledger/finance core. Gated by the Accounting module.
    key: 'accounting',
    heading: 'Accounting',
    icon: IconReportMoney,
    module: 'Accounting',
    functionGate: 'Accounting',
    description: 'The ledger — journals, statements, tax, banking and assets.',
    items: [
      // Finance is gated at Company Admin & above until the department-function
      // model ships (Stage E1), which will also admit an Accounting-dept Manager.
      { to: '/accounting', label: 'Overview', icon: IconLayoutDashboard, roles: ADMINS },
      { to: '/accounting/accounts', label: 'Chart of Accounts', icon: IconBook2, roles: ADMINS },
      { to: '/accounting/vouchers/new', label: 'Voucher Entry', icon: IconKeyboard, roles: ADMINS },
      { to: '/accounting/vouchers', label: 'Voucher Register', icon: IconListDetails, roles: ADMINS },
      { to: '/accounting/journals', label: 'Journals', icon: IconBook, roles: ADMINS },
      { to: '/accounting/general-ledger', label: 'General Ledger', icon: IconBook2, roles: ADMINS },
      { to: '/accounting/profit-loss', label: 'Profit & Loss', icon: IconTrendingUp, roles: ADMINS },
      { to: '/accounting/balance-sheet', label: 'Balance Sheet', icon: IconReportAnalytics, roles: ADMINS },
      { to: '/accounting/cash-flow', label: 'Cash Flow', icon: IconArrowsExchange, roles: ADMINS },
      { to: '/accounting/trial-balance', label: 'Trial Balance', icon: IconScale, roles: ADMINS },
      { to: '/accounting/vat-return', label: 'VAT Return', icon: IconReceiptTax, roles: ADMINS },
      { to: '/accounting/tax-rates', label: 'Tax Rates', icon: IconReceiptTax, roles: ADMINS },
      { to: '/accounting/exchange-rates', label: 'Exchange Rates', icon: IconCurrencyDollar, roles: ADMINS },
      { to: '/accounting/bank-accounts', label: 'Bank Accounts', icon: IconBuildingBank, roles: ADMINS },
      { to: '/accounting/bank-reconciliation', label: 'Bank Reconciliation', icon: IconChecklist, roles: ADMINS },
      { to: '/accounting/bank-statements', label: 'Bank Statements', icon: IconFileImport, roles: ADMINS },
      { to: '/accounting/cost-centres', label: 'Cost Centres', icon: IconSitemap, roles: ADMINS },
      { to: '/accounting/inbox', label: 'Document Inbox', icon: IconSparkles, roles: ADMINS },
      { to: '/accounting/fiscal-years', label: 'Fiscal Years', icon: IconCalendarStats, roles: ADMINS },
      { to: '/accounting/opening-balances', label: 'Opening Balances', icon: IconAdjustments, roles: ADMINS },
      { to: '/accounting/fixed-assets', label: 'Fixed Assets', icon: IconBuildingWarehouse, roles: ADMINS },
    ],
  },
  {
    key: 'approvals',
    heading: 'Approvals',
    icon: IconChecklist,
    items: [
      { to: '/approvals/pending', label: 'Inbox', icon: IconInbox, roles: APPROVERS },
      { to: '/approvals/rules', label: 'Rules', icon: IconChecklist, roles: ADMINS },
      { to: '/approvals/history', label: 'History', icon: IconHistory, roles: APPROVERS },
    ],
  },
  {
    key: 'org',
    heading: 'Organization',
    icon: IconSettings,
    items: [
      { to: '/modules', label: 'Modules', icon: IconApps, roles: ['SuperAdmin'] },
      { to: '/companies', label: 'Companies', icon: IconBuilding, roles: ADMINS },
      { to: '/branches', label: 'Branches', icon: IconMapPin, roles: ADMINS },
      { to: '/users', label: 'Users', icon: IconUserPlus, roles: ['SuperAdmin', 'CompanyAdmin', 'Manager'] },
    ],
  },
];
