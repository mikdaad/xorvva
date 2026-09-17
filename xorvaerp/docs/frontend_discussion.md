# 🎨 FRONTEND — Complete Discussion Document

> **Purpose:** Every frontend decision before we write a single line of code.  
> **Rule:** No code here — only architecture, design, and structure.  
> **Action:** Read, discuss, approve. Then we build.

---

## Table of Contents

1. [Tech Stack Decisions](#1-tech-stack-decisions)
2. [Project Structure](#2-project-structure)
3. [Layout & Navigation System](#3-layout--navigation-system)
4. [Reusable Component Strategy](#4-reusable-component-strategy)
5. [All Screens — Page by Page](#5-all-screens--page-by-page)
6. [Arabic/English & RTL Support](#6-arabicenglish--rtl-support)
7. [Routing Structure](#7-routing-structure)
8. [State Management](#8-state-management)
9. [Theme & Design System](#9-theme--design-system)
10. [Data Tables — The Core UI Pattern](#10-data-tables--the-core-ui-pattern)
11. [Forms — The Other Core Pattern](#11-forms--the-other-core-pattern)
12. [Charts & Dashboard](#12-charts--dashboard)
13. [File Upload UX](#13-file-upload-ux)
14. [PDF Preview & Print](#14-pdf-preview--print)
15. [Notifications & Feedback](#15-notifications--feedback)
16. [Responsive Design](#16-responsive-design)
17. [Performance Optimization](#17-performance-optimization)
18. [Day-by-Day Build Sequence](#18-day-by-day-build-sequence)

---

## 1. Tech Stack Decisions

### Final Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Build Tool** | Vite | 10x faster than CRA. Hot module replacement. Instant dev server startup. |
| **Language** | TypeScript | Type safety catches bugs before runtime. Better IDE autocomplete. Self-documenting. |
| **UI Framework** | React 18+ | Component-based, massive ecosystem, best for complex SPAs |
| **Component Library** | Ant Design 5.x | Enterprise-grade. 60+ components. Built-in RTL support. Tables, forms, date pickers — everything we need out of the box. |
| **Routing** | React Router 6 | Industry standard. Nested routes. Layout routes. |
| **Server State** | TanStack Query (React Query) | Caching, refetching, loading/error states — all handled automatically |
| **Client State** | Zustand | Lightweight (2KB). Simple API. For auth state, sidebar state, language preference. |
| **i18n** | i18next + react-i18next | Industry standard. JSON translation files. Lazy loading. Pluralization. |
| **Charts** | Recharts | React-native charting. Works great with Ant Design. |
| **HTTP Client** | Axios | Interceptors for auth token, response formatting, error handling |
| **Forms** | Ant Design Form (built-in) | Integrated with Ant Design components. Validation built-in. |
| **Date Handling** | Day.js | Ant Design uses Day.js internally. Tiny (2KB vs Moment's 70KB). |
| **Icons** | Ant Design Icons + React Icons | Comprehensive icon set |
| **PDF Viewing** | react-pdf or iframe | For preview before print |
| **Excel** | SheetJS (xlsx) | Client-side Excel parsing if needed |

### What We're NOT Using (and Why)

| Rejected | Why Not |
|----------|---------|
| Next.js | Server-side rendering is unnecessary. This is an internal tool, not a public SEO site. Vite SPA is simpler and faster to build. |
| Tailwind CSS | Ant Design has its own design system. Mixing Tailwind + Ant Design creates conflicts. Ant Design's built-in styling is sufficient. |
| Material UI (MUI) | Ant Design has better RTL support, better data tables, and is more enterprise-focused. MUI tables require heavy customization. |
| Redux | Overkill. 90% of state is server state (handled by TanStack Query). The 10% client state (auth, sidebar) is handled by Zustand. |
| Formik / React Hook Form | Ant Design has its own Form component with validation. Using a third-party form library creates friction. |
| Shadcn/ui | Beautiful, but every component needs manual assembly. Ant Design gives us pre-built enterprise components instantly. |

### Why Ant Design is the Clear Winner

| Requirement | Ant Design Support |
|-------------|-------------------|
| Data Tables with pagination, sorting, filtering | ✅ `<Table>` — fully featured out of the box |
| Forms with validation | ✅ `<Form>` — built-in validation, layouts, error display |
| Date Pickers | ✅ `<DatePicker>` — supports multiple locales, Hijri plugin possible |
| Select/Dropdown with search | ✅ `<Select>` — searchable, multi-select, async loading |
| Modal dialogs | ✅ `<Modal>` — for delete confirmations, quick edits |
| Sidebar navigation | ✅ `<Menu>` + `<Layout.Sider>` — collapsible, nested items |
| RTL (Arabic) | ✅ `<ConfigProvider direction="rtl">` — one line to flip everything |
| Notification toasts | ✅ `notification` and `message` APIs |
| Tree structure | ✅ `<Tree>` — for Chart of Accounts |
| Tabs | ✅ `<Tabs>` — for settings, detail views |
| Statistics cards | ✅ `<Statistic>` + `<Card>` — for dashboard |
| Upload component | ✅ `<Upload>` — drag & drop, file list, preview |
| Breadcrumbs | ✅ `<Breadcrumb>` — for page navigation |

---

## 2. Project Structure

```
tadbeer-frontend/
├── public/
│   ├── favicon.ico
│   └── logo.svg
│
├── src/
│   ├── api/
│   │   ├── axios.ts              ← Axios instance with interceptors
│   │   ├── auth.api.ts           ← Auth API calls
│   │   ├── customers.api.ts      ← Customer API calls
│   │   ├── workers.api.ts        ← Worker API calls
│   │   ├── sales.api.ts
│   │   ├── payments.api.ts
│   │   ├── contracts.api.ts
│   │   ├── ... (one file per module)
│   │   └── dashboard.api.ts
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx     ← Main layout (sidebar + header + content)
│   │   │   ├── Sidebar.tsx       ← Sidebar navigation
│   │   │   ├── Header.tsx        ← Top header (user menu, lang switch, notifications)
│   │   │   └── Breadcrumbs.tsx
│   │   │
│   │   ├── common/
│   │   │   ├── DataTable.tsx     ← Reusable table with pagination, search, filters
│   │   │   ├── PageHeader.tsx    ← Page title + action buttons
│   │   │   ├── FormModal.tsx     ← Reusable create/edit modal
│   │   │   ├── DeleteConfirm.tsx ← Delete confirmation dialog
│   │   │   ├── StatusBadge.tsx   ← Colored status tags
│   │   │   ├── StatCard.tsx      ← Dashboard stat card
│   │   │   ├── FileUpload.tsx    ← Reusable file uploader
│   │   │   ├── EmptyState.tsx    ← Empty table/list placeholder
│   │   │   └── LoadingScreen.tsx ← Full-page loading spinner
│   │   │
│   │   └── module-specific/
│   │       ├── InvoiceBuilder.tsx   ← Line item editor for sales
│   │       ├── PaymentRecorder.tsx  ← Payment form with invoice selection
│   │       ├── AccountTree.tsx      ← Chart of accounts tree view
│   │       ├── AttendanceGrid.tsx   ← Bulk attendance marking
│   │       └── PermissionMatrix.tsx ← Role permission checkbox grid
│   │
│   ├── pages/
│   │   ├── auth/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── ForgotPasswordPage.tsx
│   │   │   └── ResetPasswordPage.tsx
│   │   │
│   │   ├── dashboard/
│   │   │   └── DashboardPage.tsx
│   │   │
│   │   ├── customers/
│   │   │   ├── CustomerListPage.tsx
│   │   │   ├── CustomerFormPage.tsx    ← Add/Edit (same component)
│   │   │   └── CustomerDetailPage.tsx  ← View with tabs (info, contracts, invoices)
│   │   │
│   │   ├── domestic-workers/
│   │   │   ├── WorkerListPage.tsx
│   │   │   ├── WorkerFormPage.tsx
│   │   │   └── WorkerDetailPage.tsx
│   │   │
│   │   ├── contracts/
│   │   │   ├── ContractListPage.tsx
│   │   │   ├── ContractFormPage.tsx
│   │   │   └── ContractDetailPage.tsx
│   │   │
│   │   ├── sales/
│   │   │   ├── SaleListPage.tsx
│   │   │   ├── SaleFormPage.tsx        ← Invoice builder
│   │   │   └── SaleDetailPage.tsx      ← View + print + payment history
│   │   │
│   │   ├── payments/
│   │   │   ├── PaymentListPage.tsx
│   │   │   └── PaymentFormPage.tsx
│   │   │
│   │   ├── credit-notes/
│   │   │   ├── CreditNoteListPage.tsx
│   │   │   └── CreditNoteFormPage.tsx
│   │   │
│   │   ├── debit-notes/
│   │   │   ├── DebitNoteListPage.tsx
│   │   │   └── DebitNoteFormPage.tsx
│   │   │
│   │   ├── suppliers/
│   │   │   ├── SupplierListPage.tsx
│   │   │   └── SupplierFormPage.tsx
│   │   │
│   │   ├── purchases/
│   │   │   ├── PurchaseListPage.tsx
│   │   │   ├── PurchaseFormPage.tsx
│   │   │   └── PurchaseDetailPage.tsx
│   │   │
│   │   ├── employees/
│   │   │   ├── EmployeeListPage.tsx
│   │   │   ├── EmployeeFormPage.tsx
│   │   │   └── EmployeeDetailPage.tsx
│   │   │
│   │   ├── departments/
│   │   │   └── DepartmentListPage.tsx  ← Modal-based add/edit
│   │   │
│   │   ├── designations/
│   │   │   └── DesignationListPage.tsx ← Modal-based add/edit
│   │   │
│   │   ├── attendance/
│   │   │   ├── AttendanceListPage.tsx
│   │   │   └── AttendanceMarkPage.tsx  ← Bulk grid
│   │   │
│   │   ├── leave/
│   │   │   └── LeaveListPage.tsx       ← List + approve/reject
│   │   │
│   │   ├── payroll/
│   │   │   ├── PayrollListPage.tsx
│   │   │   └── PayrollGeneratePage.tsx
│   │   │
│   │   ├── accounting/
│   │   │   ├── ChartOfAccountsPage.tsx ← Tree view
│   │   │   ├── JournalEntryListPage.tsx
│   │   │   ├── JournalEntryFormPage.tsx
│   │   │   ├── LedgerPage.tsx
│   │   │   └── TrialBalancePage.tsx
│   │   │
│   │   ├── expenses/
│   │   │   ├── ExpenseListPage.tsx
│   │   │   └── ExpenseFormPage.tsx
│   │   │
│   │   ├── reports/
│   │   │   ├── SalesReportPage.tsx
│   │   │   ├── PaymentReportPage.tsx
│   │   │   ├── OutstandingReportPage.tsx
│   │   │   ├── CustomerStatementPage.tsx
│   │   │   ├── WorkerReportPage.tsx
│   │   │   ├── ProfitLossPage.tsx
│   │   │   ├── VatReportPage.tsx
│   │   │   ├── AttendanceReportPage.tsx
│   │   │   └── PayrollReportPage.tsx
│   │   │
│   │   ├── settings/
│   │   │   ├── GeneralSettingsPage.tsx
│   │   │   ├── InvoiceSettingsPage.tsx
│   │   │   ├── FileUploadSettingsPage.tsx
│   │   │   └── CompanyProfilePage.tsx
│   │   │
│   │   ├── users/
│   │   │   ├── UserListPage.tsx
│   │   │   └── UserFormPage.tsx
│   │   │
│   │   ├── roles/
│   │   │   ├── RoleListPage.tsx
│   │   │   └── RoleFormPage.tsx        ← Permission matrix
│   │   │
│   │   ├── master-data/
│   │   │   ├── NationalityListPage.tsx ← Modal-based
│   │   │   ├── CategoryListPage.tsx    ← Modal-based
│   │   │   ├── TaxListPage.tsx         ← Modal-based
│   │   │   └── ServiceListPage.tsx
│   │   │
│   │   ├── registers/
│   │   │   └── RegisterListPage.tsx
│   │   │
│   │   ├── profile/
│   │   │   └── ProfilePage.tsx         ← Edit own profile
│   │   │
│   │   └── errors/
│   │       ├── NotFoundPage.tsx        ← 404
│   │       └── ServerErrorPage.tsx     ← 500
│   │
│   ├── hooks/
│   │   ├── useAuth.ts            ← Auth state and actions
│   │   ├── usePermission.ts      ← Check if user has permission
│   │   ├── useLanguage.ts        ← Language switching
│   │   ├── useDebounce.ts        ← Debounced search input
│   │   └── useNotification.ts    ← Toast notification helper
│   │
│   ├── store/
│   │   ├── authStore.ts          ← Zustand: user, tokens, login/logout
│   │   ├── uiStore.ts            ← Zustand: sidebar collapsed, dark mode
│   │   └── languageStore.ts      ← Zustand: current language (en/ar)
│   │
│   ├── i18n/
│   │   ├── index.ts              ← i18next configuration
│   │   ├── en/
│   │   │   ├── common.json       ← Shared labels (Save, Cancel, Delete, etc.)
│   │   │   ├── sidebar.json      ← Sidebar menu labels
│   │   │   ├── dashboard.json    ← Dashboard labels
│   │   │   ├── customers.json    ← Customer module labels
│   │   │   ├── workers.json
│   │   │   ├── sales.json
│   │   │   ├── ... (one file per module)
│   │   │   └── settings.json
│   │   └── ar/
│   │       ├── common.json       ← Arabic translations (same structure)
│   │       ├── sidebar.json
│   │       ├── ... (mirrors en/ exactly)
│   │       └── settings.json
│   │
│   ├── theme/
│   │   ├── antdTheme.ts          ← Ant Design theme token overrides
│   │   ├── colors.ts             ← Color palette constants
│   │   └── index.css             ← Global CSS (fonts, scrollbar, etc.)
│   │
│   ├── types/
│   │   ├── auth.types.ts
│   │   ├── customer.types.ts
│   │   ├── worker.types.ts
│   │   ├── sale.types.ts
│   │   ├── ... (one file per module)
│   │   └── common.types.ts       ← Pagination, API response, etc.
│   │
│   ├── utils/
│   │   ├── constants.ts          ← Status labels, color maps
│   │   ├── formatters.ts         ← Currency, date, number formatting
│   │   ├── permissions.ts        ← Permission constants
│   │   └── helpers.ts            ← Misc utility functions
│   │
│   ├── router/
│   │   └── index.tsx             ← All routes defined here
│   │
│   ├── App.tsx                   ← Root component
│   └── main.tsx                  ← Entry point
│
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
└── .env
```

### Key Architectural Decisions

| Decision | Reasoning |
|----------|-----------|
| **Pages are full screens, components are reusable pieces** | Clear separation. Pages own layout. Components are shared. |
| **One API file per module** | Each file exports functions like `getCustomers()`, `createCustomer()`, etc. Easy to find. |
| **One type file per module** | TypeScript interfaces matching the backend Prisma models. |
| **i18n split by module** | Don't load all translations upfront. Load per-module as needed. |
| **No "containers" or "smart components"** | Pages ARE the containers. They handle data fetching and pass data to dumb components. This simplification is intentional. |

---

## 3. Layout & Navigation System

### App Layout Structure

```
┌──────────────────────────────────────────────────┐
│  HEADER (60px height)                            │
│  [☰ Toggle] [Breadcrumbs]    [🔔] [🌐 EN/AR] [👤]│
├────────┬─────────────────────────────────────────┤
│        │                                         │
│  SIDE  │         CONTENT AREA                    │
│  BAR   │                                         │
│        │    ┌─────────────────────────────┐      │
│  240px │    │  Page Header                │      │
│  (col- │    │  [Title]     [+ Add Button] │      │
│  laps- │    ├─────────────────────────────┤      │
│  ible  │    │                             │      │
│  to    │    │  Page Content               │      │
│  80px) │    │  (Table / Form / Dashboard) │      │
│        │    │                             │      │
│        │    │                             │      │
│        │    │                             │      │
│        │    └─────────────────────────────┘      │
│        │                                         │
└────────┴─────────────────────────────────────────┘
```

### In RTL (Arabic) Mode — Everything Mirrors

```
┌──────────────────────────────────────────────────┐
│                            HEADER (60px)         │
│ [👤] [AR/EN 🌐] [🔔]    [Breadcrumbs] [Toggle ☰]│
├─────────────────────────────────────────┬────────┤
│                                         │        │
│         CONTENT AREA                    │  SIDE  │
│                                         │  BAR   │
│    ┌─────────────────────────────┐      │        │
│    │              Page Header    │      │  240px │
│    │  [+ Add Button]    [Title]  │      │        │
│    ├─────────────────────────────┤      │        │
│    │                             │      │        │
│    │       Page Content          │      │        │
│    │                             │      │        │
│    └─────────────────────────────┘      │        │
│                                         │        │
└─────────────────────────────────────────┴────────┘
```

> [!NOTE]
> Ant Design handles this RTL flip **automatically** with `<ConfigProvider direction="rtl">`. We don't need to write custom RTL CSS. Tables, forms, buttons, menus — everything flips.

### Sidebar Menu Structure

```
📊 Dashboard
─────────────────
📋 CRM & Sales
  ├── 👥 Customers
  ├── 🧾 Services
  ├── 📝 Typing / Sales
  ├── 💰 Payments
  ├── 📄 Contracts
  ├── 💳 Credit Notes
  ├── 💳 Debit Notes
  └── 🏪 Registers
─────────────────
🏠 Domestic Workers
  └── 👩 Workers
─────────────────
🏢 Procurement
  ├── 🤝 Suppliers
  └── 🛒 Purchases
─────────────────
👔 HR & Payroll
  ├── 👨‍💼 Employees
  ├── 🏢 Departments
  ├── 📌 Designations
  ├── ⏰ Attendance
  ├── 🏖️ Leave Management
  └── 💵 Payroll
─────────────────
📊 Accounting
  ├── 📚 Chart of Accounts
  ├── 📝 Journal Entries
  ├── 📒 Ledger
  ├── ⚖️ Trial Balance
  └── 💸 Expenses
─────────────────
📈 Reports
  ├── 📊 Sales Report
  ├── 💰 Payment Report
  ├── ⏳ Outstanding Report
  ├── 👤 Customer Statement
  ├── 👩 Worker Report
  ├── 📉 Profit & Loss
  ├── 🧾 VAT Report
  ├── ⏰ Attendance Report
  └── 💵 Payroll Report
─────────────────
⚙️ Settings
  ├── 🏢 Company Profile
  ├── ⚙️ General Settings
  ├── 🧾 Invoice Settings
  ├── 📁 File Upload Settings
  ├── 👥 Users
  ├── 🔐 Roles & Permissions
  └── 📋 Master Data
      ├── 🌍 Nationalities
      ├── 📂 Categories
      └── 🧾 Taxes
```

### Sidebar Behavior

| Feature | Behavior |
|---------|----------|
| **Collapse** | Toggle button collapses to 80px (icons only) |
| **Active highlighting** | Current page's menu item is highlighted |
| **Accordion** | Only one section open at a time |
| **Permission-based** | Menu items hidden if user lacks permission for that module |
| **Sticky** | Sidebar doesn't scroll with content |
| **Mobile** | Becomes a drawer (slides in/out) |

---

## 4. Reusable Component Strategy

### The Two Components That Matter Most

**80% of this entire frontend is just TWO patterns repeated:**

1. **DataTable** — List page with a table
2. **FormPage** — Create/Edit page with a form

If we build these two components well, every module page becomes a **thin configuration layer** on top of them.

### Pattern 1: DataTable Component

Every list page follows this structure:

```
┌─────────────────────────────────────────────┐
│ Page Header                                 │
│ [Module Name]               [+ Add New]     │
├─────────────────────────────────────────────┤
│ Filters Bar                                 │
│ [🔍 Search...] [Status ▾] [Date From] [To] │
│                            [Export] [Filter] │
├─────────────────────────────────────────────┤
│ # │ Name    │ Phone   │ Status │ Actions    │
│───┼─────────┼─────────┼────────┼────────────│
│ 1 │ Ahmed   │ 05x...  │ ●Active│ [✏️] [🗑️]  │
│ 2 │ Sara    │ 05x...  │ ●Active│ [✏️] [🗑️]  │
│ 3 │ Fatima  │ 05x...  │ ○Inact │ [✏️] [🗑️]  │
│   │         │         │        │            │
├─────────────────────────────────────────────┤
│ Showing 1-20 of 156    [< 1 2 3 4 5 ... >] │
└─────────────────────────────────────────────┘
```

**DataTable accepts configuration:**
- Column definitions (name, key, render function, sortable, width)
- API endpoint to fetch data
- Search fields to search across
- Filter definitions (dropdowns, date ranges)
- Action buttons per row (edit, delete, view, custom)
- Top-right action buttons (Add, Export)
- Pagination settings

### Pattern 2: Form Page Component

Every create/edit page follows this structure:

```
┌─────────────────────────────────────────────┐
│ Page Header                                 │
│ [← Back] [Create Customer]  [Save] [Cancel] │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─ Personal Information ─────────────────┐ │
│  │                                        │ │
│  │  First Name *        Last Name *       │ │
│  │  [____________]      [____________]    │ │
│  │                                        │ │
│  │  Email               Phone *           │ │
│  │  [____________]      [____________]    │ │
│  │                                        │ │
│  └────────────────────────────────────────┘ │
│                                             │
│  ┌─ Address ──────────────────────────────┐ │
│  │                                        │ │
│  │  Address                               │ │
│  │  [________________________________]   │ │
│  │                                        │ │
│  │  City                 Emirate          │ │
│  │  [____________]      [▾ Select  ]      │ │
│  │                                        │ │
│  └────────────────────────────────────────┘ │
│                                             │
└─────────────────────────────────────────────┘
```

**Forms use Ant Design's `<Form>` component with:**
- Sections/cards to group related fields
- Two-column layout on desktop, single column on mobile
- Validation rules per field (required, email format, min/max, etc.)
- Dependent dropdowns (select customer → filter their invoices)
- File upload fields where needed

---

## 5. All Screens — Page by Page

### 5.1 Auth Pages (3 screens)

**Login Page:**
- Centered card design with company logo
- Email + password fields
- "Remember me" checkbox
- "Forgot password" link
- Language toggle (EN/AR) in corner
- Background: subtle gradient or pattern

**Forgot Password Page:**
- Email field
- "Send reset link" button
- Back to login link

**Reset Password Page:**
- New password + confirm password
- Password strength indicator
- Submit button

---

### 5.2 Dashboard (1 screen)

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐│
│  │Total │ │Total │ │Avail.│ │Active│ │Month │ │Outst.││
│  │Cust. │ │Workers│ │Workers│ │Contr.│ │Revenue│ │Balance│
│  │ 248  │ │ 156  │ │  42  │ │  89  │ │45.2K │ │12.8K ││
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘│
│                                                         │
│  ┌────────────── Revenue Chart ──────────────┐ ┌──────┐│
│  │  ███                                      │ │Worker││
│  │  ███ ███                            ███   │ │by Nat││
│  │  ███ ███ ███                  ███   ███   │ │ 🟢PH ││
│  │  ███ ███ ███ ███        ███   ███   ███   │ │ 🔵IN ││
│  │  ███ ███ ███ ███  ███   ███   ███   ███   │ │ 🟡ET ││
│  │  Jan Feb Mar Apr  May  Jun   Jul   Aug    │ │ 🔴BD ││
│  └───────────────────────────────────────────┘ └──────┘│
│                                                         │
│  ┌────── Recent Invoices ──────┐ ┌── Recent Payments ─┐│
│  │ INV-001 │ Ahmed │ 5,000 AED│ │ PAY-001 │ Cash │3K ││
│  │ INV-002 │ Sara  │ 3,200 AED│ │ PAY-002 │ Card │5K ││
│  │ INV-003 │ Omar  │ 8,500 AED│ │ PAY-003 │ Bank │2K ││
│  └─────────────────────────────┘ └────────────────────┘│
│                                                         │
│  ┌── ⚠️ Expiring Contracts ──┐ ┌── ⚠️ Expiring Visas ──┐│
│  │ CON-005 │ 15 days left    │ │ DW-042 │ 7 days left  ││
│  │ CON-012 │ 22 days left    │ │ DW-018 │ 12 days left ││
│  └───────────────────────────┘ └────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

**Dashboard components:**
- 6 stat cards across the top row
- Revenue bar chart (monthly) — large, taking 2/3 width
- Workers by nationality pie chart — 1/3 width
- Recent invoices mini-table — 1/2 width
- Recent payments mini-table — 1/2 width
- Expiring contracts alert list
- Expiring visas alert list

---

### 5.3 Customer Pages (3 screens)

**Customer List:**
- Table columns: #, Customer No., Name, Phone, Emirates ID, Nationality, Balance, Status, Actions
- Filters: Search, Nationality dropdown, Status dropdown
- Actions per row: View, Edit, Delete

**Customer Form (Add/Edit):**
- Sections: Personal Info, Contact, Address, Documents, Notes
- Fields as defined in backend document

**Customer Detail:**
- Tabs: Overview, Contracts, Invoices, Payments, Activity Log
- Overview tab shows customer info in read-only card format
- Other tabs show filtered data tables

---

### 5.4 Domestic Worker Pages (3 screens)

**Worker List:**
- Table columns: Photo (thumbnail), Worker No., Name, Nationality, Category, Visa Status, Worker Status, Assigned Customer, Actions
- Filters: Search, Nationality, Category, Status, Visa Status
- Color-coded status badges

**Worker Form (Add/Edit):**
- This is the LARGEST form in the system
- Tabs or accordion sections:
  - Personal Information (name, DOB, gender, nationality, etc.)
  - Passport Details (passport no, issue/expiry, country)
  - Visa Details (visa no, type, status, dates, unified number)
  - Work & Skills (category, skills, experience, salary)
  - Medical (status, report date, report upload)
  - Documents (multi-file upload area)
  - Notes

**Worker Detail:**
- Profile card at top (photo, name, nationality, status badge)
- Tabs: Overview, Documents, Contracts History, Activity Log
- Documents tab: grid of uploaded documents with preview/download

---

### 5.5 Contract Pages (3 screens)

**Contract List:**
- Table: #, Contract No., Customer, Worker, Type, Start Date, End Date, Amount, Status, Actions
- Filters: Search, Status, Contract Type, Date Range
- Actions: View, Edit, Activate, Terminate, Print, Delete

**Contract Form:**
- Customer select (searchable dropdown)
- Worker select (searchable dropdown — only shows AVAILABLE workers)
- Contract type, dates, salary, amount
- Terms and conditions textarea

**Contract Detail:**
- Contract info card
- Customer info section
- Worker info section
- Payment/invoice history linked to this contract
- Action buttons: Activate, Terminate, Renew, Print PDF

---

### 5.6 Sales/Invoice Pages (3 screens)

**Invoice List:**
- Table: #, Invoice No., Date, Customer, Total, Paid, Balance, Status, Actions
- Filters: Search, Status, Customer, Date Range
- Status badges: 🟢 Paid, 🟡 Partial, 🔴 Overdue, ⚪ Draft

**Invoice Builder (Add/Edit):**
- This is a SPECIAL form — not a simple field list

```
┌─────────────────────────────────────────────────┐
│ Create Invoice                    [Save] [Cancel]│
├─────────────────────────────────────────────────┤
│                                                  │
│  Customer *         Invoice Date    Due Date     │
│  [▾ Search...]      [📅 01/07/26]  [📅 15/07/26]│
│                                                  │
│  Reference                                       │
│  [________________]                              │
│                                                  │
│ ┌─── Line Items ─────────────────────────────┐  │
│ │ # │ Service      │ Desc  │ Qty │ Price│ Tax │  │
│ │───┼──────────────┼───────┼─────┼──────┼─────│  │
│ │ 1 │ [▾ Visa Pro.]│ [   ] │ [1] │[500] │ [5%]│  │
│ │ 2 │ [▾ Contract ]│ [   ] │ [1] │[200] │ [5%]│  │
│ │ 3 │ [▾ Medical  ]│ [   ] │ [1] │[300] │ [5%]│  │
│ │                  [+ Add Line Item]           │  │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│                        Subtotal:    1,000.00 AED │
│                        VAT (5%):       50.00 AED │
│                        Discount:        0.00 AED │
│                        ─────────────────────────│
│                        TOTAL:       1,050.00 AED │
│                                                  │
│  Notes                                           │
│  [________________________________]              │
└─────────────────────────────────────────────────┘
```

**Invoice Detail:**
- Invoice header (company logo, customer info, dates)
- Line items table (read-only)
- Totals section
- Payment history table
- Action buttons: Print PDF, Record Payment, Send, Duplicate

---

### 5.7 Payment Pages (2 screens)

**Payment List:**
- Table: #, Payment No., Date, Customer, Invoice No., Amount, Method, Status, Actions
- Filters: Search, Method, Status, Date Range

**Record Payment Form:**
- Customer select → auto-filters invoices
- Invoice select → shows outstanding balance
- Amount (can't exceed balance)
- Payment method dropdown
- Date, reference, notes

---

### 5.8 Supplier & Purchase Pages (4 screens)

**Supplier List + Form:** Similar to Customer but simpler (fewer fields)

**Purchase List + Form:** Similar to Sales/Invoice but references suppliers instead of customers

---

### 5.9 Employee Pages (3 screens)

**Employee List:**
- Table: Photo, Emp No., Name, Department, Designation, Phone, Salary, Status, Actions
- Filters: Search, Department, Status

**Employee Form:**
- Sections: Personal, Employment (department, designation, dates), Salary & Benefits, Bank Details, Emergency Contact, Documents

**Employee Detail:**
- Profile card, attendance summary, payroll history tabs

---

### 5.10 Attendance Pages (2 screens)

**Attendance List:**
- Table: Date filter at top, then grid of employees vs attendance status
- Daily view or monthly summary view

**Mark Attendance (Bulk):**
- Date selector at top
- Grid: Employee Name | Check In | Check Out | Status dropdown
- Mark all present / all absent quick buttons
- Save all at once

---

### 5.11 Payroll Pages (2 screens)

**Payroll List:**
- Table: Month/Year, Employee, Basic, Allowances, Gross, Deductions, Net, Status
- Filters: Month, Year, Department, Status

**Generate Payroll:**
- Select Month + Year
- System auto-generates records for all active employees
- Review table with editable deductions column
- Bulk "Process" and "Mark Paid" actions

---

### 5.12 Accounting Pages (5 screens)

**Chart of Accounts:**
- Tree view (expandable/collapsible) using Ant Design Tree component
- Shows: Account Code, Name, Type, Balance
- Add/Edit via modal
- Color-coded by type (green=Asset, red=Liability, blue=Revenue, orange=Expense)

**Journal Entry List:**
- Table: Entry No., Date, Description, Source, Debit Total, Credit Total
- Filter by source type, date range

**Journal Entry Form:**
- Date, description, reference
- Multi-line debit/credit entry table:
  - Account dropdown, Description, Debit amount, Credit amount
  - Running totals at bottom
  - Validation: total debits must equal total credits

**Ledger Page:**
- Account selector dropdown at top
- Date range filter
- Transaction list with running balance
- No create/edit — read-only report view

**Trial Balance:**
- Date range selector
- Table: Account Code, Account Name, Debit Balance, Credit Balance
- Totals row at bottom (must balance)
- Export to Excel/PDF

---

### 5.13 Report Pages (9 screens)

All reports follow the same pattern:

```
┌─────────────────────────────────────────────┐
│ [Report Title]              [📥 Excel] [🖨️]  │
├─────────────────────────────────────────────┤
│ Filters:                                    │
│ [Date From] [Date To] [Customer ▾] [Apply]  │
├─────────────────────────────────────────────┤
│ Summary Cards (optional):                   │
│ [Total: 45,200] [Count: 28] [Avg: 1,614]   │
├─────────────────────────────────────────────┤
│ Data Table:                                 │
│ ...filtered results...                      │
├─────────────────────────────────────────────┤
│ Totals Row:                                 │
│                    Grand Total: 45,200 AED  │
└─────────────────────────────────────────────┘
```

---

### 5.14 Settings Pages (4 screens)

**Company Profile:** Company name, logo upload, address, TRN, financial year  
**General Settings:** Currency, timezone, date format, default tax  
**Invoice Settings:** Invoice prefix, contract prefix, payment terms template  
**File Upload Settings:** Max size, allowed types

All use simple form layouts with Save button.

---

### 5.15 User & Role Pages (4 screens)

**User List + Form:** Name, email, role dropdown, status, password (for creation)

**Role List + Form:**
- Role name, description
- Permission matrix:

```
┌──────────────────────────────────────────────────┐
│  Role: Accountant                                │
├───────────────┬──────┬────────┬──────┬────────┬──┤
│ Module        │ View │ Create │ Edit │ Delete │Ex│
├───────────────┼──────┼────────┼──────┼────────┼──┤
│ Dashboard     │  ☑   │   -    │  -   │   -    │ -│
│ Customers     │  ☑   │   ☐    │  ☐   │   ☐    │ ☑│
│ Workers       │  ☑   │   ☐    │  ☐   │   ☐    │ ☑│
│ Contracts     │  ☑   │   ☐    │  ☐   │   ☐    │ ☑│
│ Sales         │  ☑   │   ☑    │  ☑   │   ☐    │ ☑│
│ Payments      │  ☑   │   ☑    │  ☑   │   ☐    │ ☑│
│ Purchases     │  ☑   │   ☑    │  ☑   │   ☐    │ ☑│
│ Accounting    │  ☑   │   ☑    │  ☑   │   ☐    │ ☑│
│ HR & Payroll  │  ☐   │   ☐    │  ☐   │   ☐    │ ☐│
│ Settings      │  ☐   │   ☐    │  ☐   │   ☐    │ ☐│
│ Users & Roles │  ☐   │   ☐    │  ☐   │   ☐    │ ☐│
└───────────────┴──────┴────────┴──────┴────────┴──┘
```

---

### 5.16 Master Data Pages (4 screens)

**Nationalities, Categories, Taxes:** Simple list + modal-based add/edit  
**Services:** List page + separate form page (more fields)

These are the simplest pages in the system — just a table and a small form modal.

---

## 6. Arabic/English & RTL Support

### Implementation Strategy

| Aspect | How |
|--------|-----|
| **Language toggle** | Button in header. Switches instantly without page reload. |
| **RTL/LTR switch** | When Arabic selected → `<ConfigProvider direction="rtl">` wraps entire app. Everything flips automatically. |
| **Translation files** | JSON files in `src/i18n/en/` and `src/i18n/ar/`. One file per module. |
| **Data fields** | Bilingual fields (name_en, name_ar) shown based on current language. Form has both fields always visible. |
| **Fonts** | English: Inter or Roboto. Arabic: Cairo or Tajawal (from Google Fonts). Both loaded, CSS font-family switches. |
| **Date format** | Both languages use DD/MM/YYYY. Day.js locale changes day/month names. |
| **Currency** | Always "AED" / "د.إ". Numbers use Western digits (0-9) in both languages. |
| **Document direction** | PDFs generate in the language matching current user preference. |

### Translation File Example Structure

**en/customers.json:**
```
{
  "title": "Customers",
  "add_new": "Add Customer",
  "fields": {
    "first_name": "First Name",
    "last_name": "Last Name",
    "phone": "Phone",
    "emirates_id": "Emirates ID",
    "nationality": "Nationality"
  },
  "status": {
    "active": "Active",
    "inactive": "Inactive"
  }
}
```

**ar/customers.json:**
```
{
  "title": "العملاء",
  "add_new": "إضافة عميل",
  "fields": {
    "first_name": "الاسم الأول",
    "last_name": "اسم العائلة",
    "phone": "الهاتف",
    "emirates_id": "الهوية الإماراتية",
    "nationality": "الجنسية"
  },
  "status": {
    "active": "نشط",
    "inactive": "غير نشط"
  }
}
```

---

## 7. Routing Structure

### All Routes

| Path | Page | Auth Required | Permission |
|------|------|---------------|------------|
| `/login` | LoginPage | ❌ | — |
| `/forgot-password` | ForgotPasswordPage | ❌ | — |
| `/reset-password/:token` | ResetPasswordPage | ❌ | — |
| `/` | DashboardPage | ✅ | — |
| `/customers` | CustomerListPage | ✅ | customers.view |
| `/customers/new` | CustomerFormPage | ✅ | customers.create |
| `/customers/:id` | CustomerDetailPage | ✅ | customers.view |
| `/customers/:id/edit` | CustomerFormPage | ✅ | customers.edit |
| `/workers` | WorkerListPage | ✅ | workers.view |
| `/workers/new` | WorkerFormPage | ✅ | workers.create |
| `/workers/:id` | WorkerDetailPage | ✅ | workers.view |
| `/workers/:id/edit` | WorkerFormPage | ✅ | workers.edit |
| `/contracts` | ContractListPage | ✅ | contracts.view |
| `/contracts/new` | ContractFormPage | ✅ | contracts.create |
| `/contracts/:id` | ContractDetailPage | ✅ | contracts.view |
| `/contracts/:id/edit` | ContractFormPage | ✅ | contracts.edit |
| `/services` | ServiceListPage | ✅ | services.view |
| `/sales` | SaleListPage | ✅ | sales.view |
| `/sales/new` | SaleFormPage | ✅ | sales.create |
| `/sales/:id` | SaleDetailPage | ✅ | sales.view |
| `/sales/:id/edit` | SaleFormPage | ✅ | sales.edit |
| `/payments` | PaymentListPage | ✅ | payments.view |
| `/payments/new` | PaymentFormPage | ✅ | payments.create |
| `/credit-notes` | CreditNoteListPage | ✅ | credit-notes.view |
| `/credit-notes/new` | CreditNoteFormPage | ✅ | credit-notes.create |
| `/debit-notes` | DebitNoteListPage | ✅ | debit-notes.view |
| `/debit-notes/new` | DebitNoteFormPage | ✅ | debit-notes.create |
| `/registers` | RegisterListPage | ✅ | registers.view |
| `/suppliers` | SupplierListPage | ✅ | suppliers.view |
| `/suppliers/new` | SupplierFormPage | ✅ | suppliers.create |
| `/purchases` | PurchaseListPage | ✅ | purchases.view |
| `/purchases/new` | PurchaseFormPage | ✅ | purchases.create |
| `/employees` | EmployeeListPage | ✅ | employees.view |
| `/employees/new` | EmployeeFormPage | ✅ | employees.create |
| `/employees/:id` | EmployeeDetailPage | ✅ | employees.view |
| `/departments` | DepartmentListPage | ✅ | departments.view |
| `/designations` | DesignationListPage | ✅ | designations.view |
| `/attendance` | AttendanceListPage | ✅ | attendance.view |
| `/attendance/mark` | AttendanceMarkPage | ✅ | attendance.create |
| `/leave` | LeaveListPage | ✅ | leave.view |
| `/payroll` | PayrollListPage | ✅ | payroll.view |
| `/payroll/generate` | PayrollGeneratePage | ✅ | payroll.create |
| `/chart-of-accounts` | ChartOfAccountsPage | ✅ | accounting.view |
| `/journal-entries` | JournalEntryListPage | ✅ | accounting.view |
| `/journal-entries/new` | JournalEntryFormPage | ✅ | accounting.create |
| `/ledger` | LedgerPage | ✅ | accounting.view |
| `/trial-balance` | TrialBalancePage | ✅ | accounting.view |
| `/expenses` | ExpenseListPage | ✅ | expenses.view |
| `/expenses/new` | ExpenseFormPage | ✅ | expenses.create |
| `/reports/sales` | SalesReportPage | ✅ | reports.view |
| `/reports/payments` | PaymentReportPage | ✅ | reports.view |
| `/reports/outstanding` | OutstandingReportPage | ✅ | reports.view |
| `/reports/customer-statement` | CustomerStatementPage | ✅ | reports.view |
| `/reports/workers` | WorkerReportPage | ✅ | reports.view |
| `/reports/profit-loss` | ProfitLossPage | ✅ | reports.view |
| `/reports/vat` | VatReportPage | ✅ | reports.view |
| `/reports/attendance` | AttendanceReportPage | ✅ | reports.view |
| `/reports/payroll` | PayrollReportPage | ✅ | reports.view |
| `/settings/company` | CompanyProfilePage | ✅ | settings.view |
| `/settings/general` | GeneralSettingsPage | ✅ | settings.view |
| `/settings/invoice` | InvoiceSettingsPage | ✅ | settings.view |
| `/settings/file-upload` | FileUploadSettingsPage | ✅ | settings.view |
| `/users` | UserListPage | ✅ | users.view |
| `/users/new` | UserFormPage | ✅ | users.create |
| `/roles` | RoleListPage | ✅ | roles.view |
| `/roles/new` | RoleFormPage | ✅ | roles.create |
| `/roles/:id/edit` | RoleFormPage | ✅ | roles.edit |
| `/nationalities` | NationalityListPage | ✅ | master-data.view |
| `/categories` | CategoryListPage | ✅ | master-data.view |
| `/taxes` | TaxListPage | ✅ | master-data.view |
| `/profile` | ProfilePage | ✅ | — |
| `*` | NotFoundPage | — | — |

**Total: ~75 routes**

---

## 8. State Management

### What Goes Where

| State Type | Where | Examples |
|-----------|-------|---------|
| **Server state** (data from API) | TanStack Query | Customer list, worker details, invoice data — ALL fetched data |
| **Auth state** | Zustand (`authStore`) | Current user, tokens, isAuthenticated, login/logout functions |
| **UI state** | Zustand (`uiStore`) | Sidebar collapsed, dark mode toggle |
| **Language state** | Zustand (`languageStore`) | Current language (en/ar), change language function |
| **Form state** | Ant Design Form (local) | Form field values — stays within the form component |

### TanStack Query Usage Pattern

For EVERY module, the same pattern:

| Hook | Purpose |
|------|---------|
| `useQuery(['customers', filters])` | Fetch list with pagination and filters |
| `useQuery(['customers', id])` | Fetch single customer by ID |
| `useMutation(createCustomer)` | Create new → invalidate list query on success |
| `useMutation(updateCustomer)` | Update → invalidate list + detail queries |
| `useMutation(deleteCustomer)` | Delete → invalidate list query |

**Why TanStack Query is essential:**
- Automatic caching — navigate away and back, data is instant (no re-fetch)
- Loading/error states built-in — no manual `isLoading` state variables
- Background refetching — data stays fresh
- Optimistic updates — UI updates before server confirms (for faster feel)
- Infinite scroll / pagination support
- Request deduplication — multiple components requesting same data = one API call

---

## 9. Theme & Design System

### Color Palette

| Purpose | Light Mode | Dark Mode |
|---------|------------|-----------|
| Primary | `#1677FF` (Ant Design blue) | `#1677FF` |
| Success | `#52C41A` (green) | `#52C41A` |
| Warning | `#FAAD14` (amber) | `#FAAD14` |
| Error | `#FF4D4F` (red) | `#FF4D4F` |
| Background | `#F5F5F5` | `#141414` |
| Sidebar | `#001529` (dark navy) | `#000000` |
| Card | `#FFFFFF` | `#1F1F1F` |
| Text | `#262626` | `#FFFFFF` |
| Border | `#D9D9D9` | `#434343` |

### Typography

| Usage | Font | Size |
|-------|------|------|
| English body | Inter | 14px |
| Arabic body | Cairo | 14px |
| Headings | Inter Bold / Cairo Bold | 18-24px |
| Table data | Inter / Cairo | 13px |
| Small labels | Inter / Cairo | 12px |

### Status Color Map

| Status | Color | Badge |
|--------|-------|-------|
| Active / Paid / Fit / Present | 🟢 Green | `success` |
| Partial / Pending / Processing | 🟡 Gold | `warning` |
| Inactive / Cancelled / Absent | ⚪ Grey | `default` |
| Overdue / Expired / Terminated | 🔴 Red | `error` |
| Draft / Reserved | 🔵 Blue | `processing` |
| Placed / Approved | 🟣 Purple | `purple` |

---

## 10. Data Tables — The Core UI Pattern

### Table Features Checklist

| Feature | Implementation |
|---------|---------------|
| **Pagination** | Ant Design Table built-in. Server-side pagination (send page + limit to API). |
| **Sorting** | Click column header to sort. Send sort field + order to API. |
| **Search** | Debounced text input (300ms delay). Searches across configured text fields. |
| **Column filters** | Dropdown filters for status, nationality, category, etc. |
| **Date range filter** | Two date pickers (From/To). Sent as query params. |
| **Row selection** | Checkboxes for bulk actions (bulk delete, bulk status change). |
| **Expandable rows** | For some tables (e.g., invoice → show line items). |
| **Column resize** | Optional — Ant Design supports it. |
| **Export to Excel** | Button triggers API call with `?export=true`, returns .xlsx file. |
| **Print** | Opens print-friendly view in new tab. |
| **Row actions** | Icon buttons: 👁 View, ✏️ Edit, 🗑️ Delete (with confirmation modal). |
| **Empty state** | Custom illustration when no data matches filters. |
| **Loading skeleton** | Ant Design Skeleton while data loads. |
| **Responsive** | On mobile: horizontally scrollable table or card-based list view. |

---

## 11. Forms — The Other Core Pattern

### Form UX Rules

| Rule | Implementation |
|------|---------------|
| **Required fields marked with *** | Ant Design Form handles this automatically with `rules: [{ required: true }]` |
| **Validation on submit** | All fields validated when Save is clicked. First error field is scrolled to. |
| **Real-time validation** | Email format, phone format — validated on blur (not on every keystroke). |
| **Dependent fields** | When Customer is selected in invoice form → load their unpaid invoices in Payment form. |
| **Auto-calculate** | Invoice line items: qty × price = line total. Sum of lines = subtotal. |
| **Unsaved changes warning** | If user navigates away with unsaved changes → "Are you sure?" modal. |
| **Loading state on submit** | Save button shows spinner, disabled during API call. Prevents double-submit. |
| **Success feedback** | After save: green toast "Customer created successfully" + redirect to list. |
| **Error feedback** | After failure: red toast with error message. Form stays open. |

---

## 12. Charts & Dashboard

### Chart Library: Recharts

| Chart Type | Used For | Data |
|-----------|----------|------|
| **Bar Chart** | Monthly revenue | 12 bars (one per month), Y-axis = AED amount |
| **Pie / Donut** | Workers by nationality | Slices = nationalities, values = count |
| **Bar (horizontal)** | Workers by category | Bars = Housemaid, Nanny, Driver, etc. |
| **Line Chart** | Revenue trend (optional) | Monthly revenue over time |
| **Area Chart** | Outstanding balance trend (optional) | Cumulative outstanding over months |

### Dashboard Refresh Strategy

- Dashboard data fetches on page load
- Auto-refresh every 5 minutes (TanStack Query `refetchInterval`)
- Manual refresh button in header

---

## 13. File Upload UX

### Upload Component Behavior

| Feature | Behavior |
|---------|----------|
| **Drag & drop zone** | "Drop files here or click to browse" |
| **File preview** | Image files show thumbnail preview. PDFs show icon. |
| **Progress bar** | Upload progress indicator per file. |
| **File type validation** | Client-side check before upload. Show error for invalid types. |
| **Size validation** | Show error if file exceeds max size. |
| **Multiple files** | For worker documents: multiple file upload. For logo/avatar: single file. |
| **Delete uploaded file** | X button to remove. Confirmation before delete. |

---

## 14. PDF Preview & Print

### Invoice PDF Preview

When user clicks "View" or "Print" on an invoice:
1. API generates PDF on backend
2. Opens in a new browser tab (or modal with iframe)
3. User can print from browser or download

### Print-Friendly Pages

- Reports have a "Print" button
- Opens a clean, header-only version of the data
- Uses `@media print` CSS to hide sidebar, header, buttons
- Automatically triggers `window.print()`

---

## 15. Notifications & Feedback

### Toast Notifications

| Action | Toast Type | Message Example |
|--------|-----------|-----------------|
| Create success | ✅ Success | "Customer created successfully" |
| Update success | ✅ Success | "Invoice updated" |
| Delete success | ✅ Success | "Record deleted" |
| Validation error | ❌ Error | "Please fill all required fields" |
| API error | ❌ Error | "Server error. Please try again." |
| Network error | ❌ Error | "No internet connection" |
| Session expired | ⚠️ Warning | "Session expired. Please login again." |

### In-App Notification Bell

- 🔔 icon in header with badge count
- Dropdown shows recent notifications
- Mark as read / mark all as read
- Click notification → navigate to relevant page

---

## 16. Responsive Design

### Breakpoints

| Breakpoint | Width | Layout |
|-----------|-------|--------|
| **Desktop** | ≥ 1200px | Full sidebar + 2-column forms |
| **Tablet** | 768-1199px | Collapsed sidebar + single column forms |
| **Mobile** | < 768px | Sidebar as drawer + card-based lists instead of tables |

### Mobile Adaptations

| Component | Desktop | Mobile |
|-----------|---------|--------|
| Sidebar | Fixed, visible | Hidden, accessible via hamburger menu (drawer) |
| Data tables | Full table with all columns | Horizontally scrollable or replaced with cards |
| Forms | 2-column layout | Single column, full width |
| Dashboard stat cards | 6 in a row | 2 per row, scrollable |
| Charts | Side by side | Stacked vertically |
| Action buttons | Icon buttons in table row | Dropdown menu per card |

---

## 17. Performance Optimization

| Technique | What It Does |
|-----------|-------------|
| **Lazy loading routes** | Each page module loaded only when navigated to. Reduces initial bundle size. |
| **TanStack Query caching** | API responses cached. Same data displayed instantly on revisit. |
| **Debounced search** | Search API called 300ms after user stops typing, not on every keystroke. |
| **Virtual scrolling** | For very large lists (1000+ rows), render only visible rows. Ant Design Table supports this. |
| **Image lazy loading** | Worker photos loaded only when visible in viewport. |
| **Code splitting** | Vite automatically splits vendor code. Ant Design components tree-shaken. |
| **Gzip/Brotli compression** | Server compresses responses. ~70% size reduction. |

---

## 18. Day-by-Day Frontend Build Sequence

### Day 6 — Foundation & Layout

| Task | Details | Time |
|------|---------|------|
| Project scaffold | Vite + React + TypeScript + Ant Design + i18next setup | 30 min |
| Theme configuration | Ant Design tokens, colors, fonts, dark mode toggle | 30 min |
| AppLayout component | Sidebar + Header + Content area | 1 hour |
| Sidebar navigation | Full menu structure, collapsible, icons | 1 hour |
| Header | User dropdown, language switch, notification bell, breadcrumbs | 45 min |
| Auth pages | Login, Forgot Password, Reset Password | 1 hour |
| Auth state & API | Login flow, token storage, auto-refresh, protected routes | 1 hour |
| Router setup | All routes with lazy loading | 30 min |
| Reusable DataTable | The core table component with pagination, search, filters | 1.5 hours |
| Reusable PageHeader | Title + action buttons component | 15 min |
| Dashboard shell | Stat cards + chart placeholders | 1 hour |

**End of Day 6:** App skeleton works. Login → Dashboard → Navigate via sidebar. All routes defined but pages are empty shells.

---

### Day 7 — Master Data + Simple CRUD Pages

| Task | Time |
|------|------|
| Nationalities page (list + modal CRUD) | 30 min |
| Categories page (list + modal CRUD) | 30 min |
| Taxes page (list + modal CRUD) | 30 min |
| Services page (list + form page) | 45 min |
| Departments page (list + modal) | 20 min |
| Designations page (list + modal) | 20 min |
| Company profile settings page | 30 min |
| General settings page | 30 min |
| Invoice settings page | 20 min |
| File upload settings page | 20 min |
| Users page (list + form) | 45 min |
| Roles page (list + permission matrix form) | 1.5 hours |
| Registers page | 30 min |
| Profile page | 30 min |

**End of Day 7:** All simple CRUD pages working. Settings fully functional. Master data populated.

---

### Day 8 — Core Entity Pages

| Task | Time |
|------|------|
| Customer list page | 45 min |
| Customer form page | 45 min |
| Customer detail page (tabs) | 1 hour |
| Worker list page | 45 min |
| Worker form page (complex, multi-section) | 1.5 hours |
| Worker detail page (tabs + documents) | 1.5 hours |
| Supplier list page | 30 min |
| Supplier form page | 30 min |
| Employee list page | 30 min |
| Employee form page (multi-section) | 1 hour |
| Employee detail page | 45 min |

**End of Day 8:** All entity management pages working. Can create, edit, view, delete customers, workers, suppliers, employees.

---

### Day 9 — Financial Pages

| Task | Time |
|------|------|
| Invoice builder (the complex line-item form) | 2 hours |
| Sale list page | 30 min |
| Sale detail page (view + print + payment history) | 1 hour |
| Payment form (customer → invoice → amount) | 1 hour |
| Payment list page | 30 min |
| Contract list page | 30 min |
| Contract form page | 45 min |
| Contract detail page | 45 min |
| Credit note list + form | 45 min |
| Debit note list + form | 45 min |
| Purchase list + form | 45 min |
| Expense list + form | 30 min |

**End of Day 9:** Full invoicing, payment, contract, and procurement workflow working end-to-end.

---

### Day 10 — Accounting + Reports + HR + Polish

| Task | Time |
|------|------|
| Chart of Accounts tree page | 1 hour |
| Journal entry list + form | 1 hour |
| Ledger page | 30 min |
| Trial Balance page | 30 min |
| Attendance list + bulk mark page | 1 hour |
| Leave management page | 30 min |
| Payroll list + generate page | 1 hour |
| All 9 report pages (using shared report template) | 2 hours |
| Dashboard: connect real data + charts | 1 hour |
| Arabic translations (all modules) | 1 hour |
| RTL testing and fixes | 30 min |
| Bug fixes and polish | 1 hour |

**End of Day 10:** Complete frontend. All pages working. Arabic/English switching. Dashboard live.

---

## Final Screen Count

| Category | Count |
|----------|-------|
| Auth | 3 |
| Dashboard | 1 |
| CRM & Sales | 16 |
| Domestic Workers | 3 |
| Procurement | 4 |
| HR & Payroll | 8 |
| Accounting | 5 |
| Reports | 9 |
| Settings | 4 |
| Users & Roles | 4 |
| Master Data | 4 |
| Profile | 1 |
| Error Pages | 2 |
| **TOTAL** | **~64 page components + ~10 reusable components = ~75 screens** |

---

> [!TIP]
> **This document is your frontend contract.** Every page, every component, every route is mapped out. Once approved, I generate each page following these exact specs.

**Both documents ready.** Review both → discuss any changes → then we start building. 🚀
