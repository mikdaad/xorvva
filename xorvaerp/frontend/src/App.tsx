import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './stores/ThemeContext';
import { ToastProvider } from './stores/ToastContext';
import { AuthProvider } from './stores/AuthContext';
import { CompanyProvider } from './stores/CompanyContext';
import { PlatformProvider } from './stores/PlatformContext';
import { ProtectedRoute, GuestRoute } from './components/RouteGuards';
import { OnboardingGate } from './components/OnboardingGate';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/auth/LoginPage';
import SignupPage from './pages/auth/SignupPage';
import OnboardingPage from './pages/onboarding/OnboardingPage';
import AddUserPage from './pages/users/AddUserPage';
import UsersPage from './pages/users/UsersPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import CompaniesPage from './pages/companies/CompaniesPage';
import ModulesPage from './pages/modules/ModulesPage';
import SubModulePage from './pages/modules/SubModulePage';
import HrHomePage from './pages/overview/HrHomePage';
import CrmHomePage from './pages/overview/CrmHomePage';
import BranchesPage from './pages/branches/BranchesPage';
import ApprovalRulesPage from './pages/approvals/ApprovalRulesPage';
import PendingApprovalsPage from './pages/approvals/PendingApprovalsPage';
import ApprovalHistoryPage from './pages/approvals/ApprovalHistoryPage';
import DepartmentsPage from './pages/hr/DepartmentsPage';
import DesignationsPage from './pages/hr/DesignationsPage';
import EmployeesPage from './pages/hr/EmployeesPage';
import EmployeeCreatePage from './pages/hr/EmployeeCreatePage';
import EmployeeProfilePage from './pages/hr/EmployeeProfilePage';
import LeaveTypesPage from './pages/hr/LeaveTypesPage';
import LeavePage from './pages/hr/LeavePage';
import HolidaysPage from './pages/hr/HolidaysPage';
import PayrollPage from './pages/hr/PayrollPage';
import AccountingHomePage from './pages/accounting/AccountingHomePage';
import ChartOfAccountsPage from './pages/accounting/ChartOfAccountsPage';
import JournalsPage from './pages/accounting/JournalsPage';
import TrialBalancePage from './pages/accounting/TrialBalancePage';
import ContactsPage from './pages/accounting/ContactsPage';
import InvoicesPage from './pages/accounting/InvoicesPage';
import PaymentsPage from './pages/accounting/PaymentsPage';
import TaxRatesPage from './pages/accounting/TaxRatesPage';
import BankAccountsPage from './pages/accounting/BankAccountsPage';
import ProfitAndLossPage from './pages/accounting/ProfitAndLossPage';
import BalanceSheetPage from './pages/accounting/BalanceSheetPage';
import GeneralLedgerPage from './pages/accounting/GeneralLedgerPage';
import AgedReceivablesPage from './pages/accounting/AgedReceivablesPage';
import BillsPage from './pages/accounting/BillsPage';
import FiscalYearsPage from './pages/accounting/FiscalYearsPage';
import OpeningBalancesPage from './pages/accounting/OpeningBalancesPage';
import FixedAssetsPage from './pages/accounting/FixedAssetsPage';
import CashFlowPage from './pages/accounting/CashFlowPage';
import BankReconciliationPage from './pages/accounting/BankReconciliationPage';
import EInvoicingSettingsPage from './pages/accounting/EInvoicingSettingsPage';
import ExchangeRatesPage from './pages/accounting/ExchangeRatesPage';
import CreditNotesPage from './pages/accounting/CreditNotesPage';
import DebitNotesPage from './pages/accounting/DebitNotesPage';
import SupplierPaymentsPage from './pages/accounting/SupplierPaymentsPage';
import VatReturnPage from './pages/accounting/VatReturnPage';
import AgedPayablesPage from './pages/accounting/AgedPayablesPage';

function Protected({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <CompanyProvider>
        <PlatformProvider>{children}</PlatformProvider>
      </CompanyProvider>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
          <Route path="/signup" element={<GuestRoute><SignupPage /></GuestRoute>} />

          <Route path="/onboarding" element={<Protected><OnboardingPage /></Protected>} />
          <Route path="/dashboard" element={<Protected><OnboardingGate><DashboardPage /></OnboardingGate></Protected>} />

          <Route path="/companies" element={<Protected><CompaniesPage /></Protected>} />
          <Route path="/modules" element={<Protected><ModulesPage /></Protected>} />
          <Route path="/m/:id" element={<Protected><SubModulePage /></Protected>} />
          <Route path="/branches" element={<Protected><BranchesPage /></Protected>} />
          <Route path="/users" element={<Protected><UsersPage /></Protected>} />
          <Route path="/users/new" element={<Protected><AddUserPage /></Protected>} />

          <Route path="/hr" element={<Protected><HrHomePage /></Protected>} />
          <Route path="/crm" element={<Protected><CrmHomePage /></Protected>} />
          <Route path="/hr/employees" element={<Protected><EmployeesPage /></Protected>} />
          <Route path="/hr/employees/new" element={<Protected><EmployeeCreatePage /></Protected>} />
          <Route path="/hr/employees/:id" element={<Protected><EmployeeProfilePage /></Protected>} />
          <Route path="/hr/departments" element={<Protected><DepartmentsPage /></Protected>} />
          <Route path="/hr/designations" element={<Protected><DesignationsPage /></Protected>} />
          <Route path="/hr/leave-types" element={<Protected><LeaveTypesPage /></Protected>} />
          <Route path="/hr/holidays" element={<Protected><HolidaysPage /></Protected>} />
          <Route path="/hr/payroll" element={<Protected><PayrollPage /></Protected>} />
          <Route path="/hr/leave" element={<Protected><LeavePage /></Protected>} />

          <Route path="/accounting" element={<Protected><AccountingHomePage /></Protected>} />
          <Route path="/accounting/accounts" element={<Protected><ChartOfAccountsPage /></Protected>} />
          <Route path="/accounting/contacts" element={<Protected><ContactsPage /></Protected>} />
          <Route path="/accounting/invoices" element={<Protected><InvoicesPage /></Protected>} />
          <Route path="/accounting/payments" element={<Protected><PaymentsPage /></Protected>} />
          <Route path="/accounting/credit-notes" element={<Protected><CreditNotesPage /></Protected>} />
          <Route path="/accounting/bills" element={<Protected><BillsPage /></Protected>} />
          <Route path="/accounting/supplier-payments" element={<Protected><SupplierPaymentsPage /></Protected>} />
          <Route path="/accounting/debit-notes" element={<Protected><DebitNotesPage /></Protected>} />
          <Route path="/accounting/journals" element={<Protected><JournalsPage /></Protected>} />
          <Route path="/accounting/general-ledger" element={<Protected><GeneralLedgerPage /></Protected>} />
          <Route path="/accounting/aged-receivables" element={<Protected><AgedReceivablesPage /></Protected>} />
          <Route path="/accounting/aged-payables" element={<Protected><AgedPayablesPage /></Protected>} />
          <Route path="/accounting/vat-return" element={<Protected><VatReturnPage /></Protected>} />
          <Route path="/accounting/e-invoicing" element={<Protected><EInvoicingSettingsPage /></Protected>} />
          <Route path="/accounting/profit-loss" element={<Protected><ProfitAndLossPage /></Protected>} />
          <Route path="/accounting/balance-sheet" element={<Protected><BalanceSheetPage /></Protected>} />
          <Route path="/accounting/cash-flow" element={<Protected><CashFlowPage /></Protected>} />
          <Route path="/accounting/trial-balance" element={<Protected><TrialBalancePage /></Protected>} />
          <Route path="/accounting/tax-rates" element={<Protected><TaxRatesPage /></Protected>} />
          <Route path="/accounting/exchange-rates" element={<Protected><ExchangeRatesPage /></Protected>} />
          <Route path="/accounting/bank-accounts" element={<Protected><BankAccountsPage /></Protected>} />
          <Route path="/accounting/bank-reconciliation" element={<Protected><BankReconciliationPage /></Protected>} />
          <Route path="/accounting/fiscal-years" element={<Protected><FiscalYearsPage /></Protected>} />
          <Route path="/accounting/opening-balances" element={<Protected><OpeningBalancesPage /></Protected>} />
          <Route path="/accounting/fixed-assets" element={<Protected><FixedAssetsPage /></Protected>} />

          <Route path="/approvals/rules" element={<Protected><ApprovalRulesPage /></Protected>} />
          <Route path="/approvals/pending" element={<Protected><PendingApprovalsPage /></Protected>} />
          <Route path="/approvals/history" element={<Protected><ApprovalHistoryPage /></Protected>} />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
