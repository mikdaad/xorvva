# Cloud ERP Platform
### Technical Stack & Architecture Brief

---

| | |
|---|---|
| **Document** | ERP Platform â€” Technology & Architecture |
| **Status** | Ready for Approval |

---

## Project Overview

A **cloud-based, multi-tenant ERP platform** that enables corporate owners to manage multiple business entities from a single system. Each business entity selects its own modules, configures its own workflows, and operates with completely isolated data.

| Capability | Description |
|-----------|-------------|
| **Multi-Tenant** | Multiple organizations on one platform, each with fully isolated data |
| **Modular** | Organizations subscribe only to the modules they need |
| **API-First** | Every feature accessible via REST API for POS and third-party integration |
| **Customizable** | Dynamic forms and custom fields per organization â€” no code changes needed |
| **Bilingual Ready** | Architecture supports English and Arabic with RTL layout |

---

## Technology Stack

### Backend Technologies

| Technology | Purpose | Why Selected |
|-----------|---------|--------------|
| **.NET 10** | Server Runtime | Enterprise-grade performance and security. Industry standard for large-scale ERP platforms. |
| **C# 14** | Programming Language | Strongly typed, object-oriented language. High developer productivity and strict compile-time checking. |
| **ASP.NET Core** | API Framework | Extremely fast, built-in dependency injection, and rich middleware ecosystem. |
| **EF Core** | Database ORM | Microsoft's official object-relational mapper. Handles complex database relationships and migrations seamlessly. |
| **MediatR** | CQRS Pattern | Decouples requests from their handlers, enforcing clean architecture and single-responsibility principles. |
| **FluentValidation** | Data Validation | Validates every command/query before processing, ensuring data integrity. |
| **JWT** | Authentication | Stateless, scalable token-based security. Supports role-based access control across all modules. |

### Database

| Technology | Purpose | Why Selected |
|-----------|---------|--------------|
| **PostgreSQL 16** | Primary Database | Most advanced open-source relational database. ACID-compliant for financial accuracy. Native JSONB support for dynamic custom fields. Built-in full-text search and row-level security. |
| **Neon** | Cloud Hosting | Serverless PostgreSQL with auto-scaling, connection pooling, automatic backups, and point-in-time recovery. Zero infrastructure management. |

**Why PostgreSQL:**

| Alternative | Why Not Selected |
|------------|-----------------|
| MongoDB | Not suitable for relational ERP data â€” invoices, payments, and accounting require strict relationships and ACID transactions |
| MySQL | Weaker JSONB support and less capable for complex financial queries |
| Firebase | Cannot handle relational queries needed for accounting and cross-module reporting |

### Frontend Technologies

| Technology | Purpose | Why Selected |
|-----------|---------|--------------|
| **React 18** | UI Framework | Component-based architecture for complex enterprise interfaces. Largest ecosystem and community support. |
| **Vite** | Build Tool | 10x faster development builds. Instant hot-reload for rapid iteration. |
| **TypeScript** | Language | Shared type definitions with backend. Compile-time error detection. |
| **Tailwind CSS** | Styling | Utility-first CSS framework for rapid, consistent UI development. Small production bundle through automatic unused CSS removal. |
| **Ant Design 5** | Component Library | 60+ enterprise-grade components â€” data tables, forms, date pickers, modals, navigation, tree views. Built-in RTL support for Arabic. |
| **TanStack Query** | Data Handling | Automatic API caching, background data sync, and loading state management. Reduces network requests. |
| **i18next** | Multi-Language | Full internationalization framework supporting English and Arabic with lazy-loaded translations. |
| **Recharts** | Charts & Graphs | Dashboard visualizations â€” bar charts, line graphs, pie charts, area charts for financial analytics. |

### Infrastructure

| Technology | Purpose | Why Selected |
|-----------|---------|--------------|
| **Docker** | Containerization | Portable deployment â€” runs identically in development, staging, and production environments. |
| **Railway** | Backend Hosting | Auto-deployment from Git, built-in monitoring, auto-scaling, HTTPS included. |
| **Vercel** | Frontend Hosting | Global CDN, automatic HTTPS, preview deployments, zero-configuration. |
| **Cloudinary** | File Storage | Cloud storage for documents, images, and uploads with secure URL access and image optimization. |
| **GitHub** | Version Control | Source code management with branch-based development workflow. |

---

## System Architecture (Modular Monolith)

To ensure maximum scalability for a massive SaaS ERP, the backend uses a **Modular Monolith** architecture. This provides strict physical isolation between different business departments.

The solution is divided into **Shared Core Projects** and **Independent Module Projects**:

### The Shared Core
1. **Xorva.Core:** Contains shared rules, base entities (like Tenant), and global constants. 
2. **Xorva.Infrastructure:** Handles the PostgreSQL database connection (EF Core) and external services.
3. **Xorva.API:** The central web project that receives HTTP requests and routes them to the correct module.

### The Modules
Each business feature gets its very own .NET Project.
*   **Xorva.Modules.Auth:** Handles login, registration, and JWT tokens.
*   **Xorva.Modules.Tenants:** Handles organization creation and settings.
*   **Xorva.Modules.HR:** Handles employees, departments, and payroll.

*(Dependency Direction: Module projects reference the Xorva.Core. The Xorva.API references all Modules and Xorva.Infrastructure to wire the application together.)*

---
## Core Modules

| Module | Key Capabilities |
|--------|-----------------|
| **Accounting** | Chart of Accounts, Journal Entries, General Ledger, Trial Balance, Profit & Loss, Balance Sheet, VAT Calculations |
| **Sales & CRM** | Customer Management, Product/Service Catalog, Invoice Builder with Auto-Calculations, Payment Recording, Credit Notes, Customer Statements |
| **Purchasing** | Supplier Management, Purchase Orders, Purchase Invoices, Supplier Payments, Debit Notes |
| **HR** | Employee Profiles, Departments, Designations, Attendance Tracking, Leave Management, Document Management |
| **Payroll** | Salary Structure, Monthly Payroll Processing, Payslip Generation, Allowances & Deductions |
| **Inventory** | Product Catalog (SKU, Categories), Warehouse Management, Stock Level Tracking, Stock Movement History |
| **POS Integration** | API-based connection with POS systems â€” sales transactions, payment sync, real-time inventory updates |
| **Reports & Dashboard** | Executive Dashboard, Sales & Revenue Reports, Payment Reports, Outstanding Receivables, Expense Analysis, VAT Reports, Payroll Summaries |
| **Settings** | Company Setup, User Management, Role-Based Permissions, Module Activation, Tax Configuration, Currency Settings, Custom Field Management |

---

## Multi-Tenancy & Customization

### What is a Tenant?

A **Tenant** is the top-level account in the system. It represents the **entire Corporation or Group** that subscribes to Xorva ERP.

Inside one Tenant, there can be multiple **Companies** (legal entities), and inside each Company, there can be multiple **Branches** (physical locations).

**Real-World Example (RightSource):**
```text
Tenant: RightSource Group
  Company 1: RightSource Trading LLC
      Branch: Dubai Office
      Branch: Abu Dhabi Office
  Company 2: RightSource IT Solutions
      Branch: Sharjah Office
  Company 3: RightSource Consulting
      Branch: Riyadh Office
```

### Data Isolation

Every Tenant operates in a completely isolated environment. We use **both** EF Core Global Query Filters AND PostgreSQL Row-Level Security (RLS) to guarantee that one Tenant can never access another Tenant's data.

### How Modules Are Distributed Per Company

Modules are activated **per Company**, not per Tenant. This means each Company inside a Tenant can choose different modules based on their specific business needs.

**Example:**

| Company | Activated Modules |
|---------|-------------------|
| RightSource Trading LLC | Accounting, Sales & CRM, Inventory, Purchasing |
| RightSource IT Solutions | HR, Payroll, Accounting |
| RightSource Consulting | HR, Accounting, Reports |

The CEO (Tenant SuperAdmin) can see consolidated reports across all three companies, but each Company Manager only sees data from their own company.

### Onboarding Flow

1. Corporation registers -> System creates a **Tenant**
2. Tenant SuperAdmin (CEO) creates **Companies** inside the Tenant
3. Each Company selects its **Modules**
4. Each Company creates **Branches** (if multiple locations)
5. System auto-configures default accounts, tax rates, and permissions per Company

---

## Roles & Permissions

The system has **5 role levels**, from highest power to lowest:

| # | Role | Scope | What They Can Do |
|---|------|-------|------------------|
| 1 | **System Admin** | Global (All Tenants) | This is **US** (the Xorva platform owners). Manages all Tenants, SaaS subscriptions, billing, and global system health. Regular customers never see this role. |
| 2 | **Tenant SuperAdmin** | Entire Tenant (All Companies) | The **CEO** of the corporation. Can see ALL companies, create/delete companies, view consolidated reports, and approve high-level requests. |
| 3 | **Company Admin** | One Company Only | The **General Manager** of a specific company. Can manage all modules within their company, manage users, and approve department-level requests. Cannot see other companies. |
| 4 | **Manager** | One Department Only | A **Department Head** (e.g., HR Manager, Sales Manager). Can manage their department data, approve employee requests (like leave), and generate department reports. |
| 5 | **Employee** | Self Only | A **Regular Staff Member**. Can view their own profile, apply for leave, submit expense claims, and view their own payslips. Cannot see other employees data. |

### How Roles Work in Practice (RightSource Example)

```text
[System Admin] -- Xorva Platform Team (manages all tenants)
    |
    [Tenant SuperAdmin] -- CEO of RightSource Group
            |
            [Company Admin] -- GM of RightSource Trading
            |       [Manager] -- Sales Manager
            |               [Employee] -- Salesman Ahmed
            |       [Manager] -- HR Manager
            |               [Employee] -- HR Staff Sara
            |
            [Company Admin] -- GM of RightSource IT
            |       [Manager] -- IT Manager
            |               [Employee] -- Developer Ali
            |
            [Company Admin] -- GM of RightSource Consulting
                    [Manager] -- Consulting Lead
                            [Employee] -- Consultant Fatima
```

---

## Dynamic Approval Engine (Core Feature)

The ERP has a **Dynamic Approval Engine** built into **Xorva.Core** as a pipeline layer — the same level as Authentication and Multi-Tenancy. It automatically intercepts all module actions without requiring approval-specific code inside any module.

### Architecture: Approval in the Core Pipeline

Every request passes through the Core pipeline in this order:

1. **Authentication** — Is the user logged in?
2. **Tenant Isolation** — Filter data by company
3. **⭐ Approval Check** — Does a matching approval rule exist for this action?
4. **Validation** — Is the submitted data correct?
5. **Module Processing** — Execute the action

The Approval Check layer sits in the Core pipeline. Modules (HR, Sales, Purchasing) have **zero approval code inside them** — the Core pipeline handles everything automatically before the request reaches any module.

### How It Works

1. **Company Admin or CEO** creates an **Approval Rule** from the Approval management screens.
2. The rule specifies: **Name** (custom label) + **Module** (which module) + **Action** (which action, dynamically registered by each module) + **Who Approves** (role-based checklist, supports multi-step sequential approval).
3. Once saved, the Core pipeline **automatically enforces** the rule on all matching requests.
4. When a matching action is performed, the system saves it with status **"Pending"**, and sends a **notification** to the first approver.
5. Approvers review from the **Pending Approvals** inbox and click **Approve** or **Reject**.
6. If multi-step: approval proceeds sequentially (Step 1 → Step 2 → Step 3). If any step rejects, the entire request is rejected.
7. When all steps approve, the action executes automatically.

### Dynamic Rule Configuration

Rules are **NOT hardcoded**. Each module dynamically registers its own approvable actions with the Core Approval Service. When a new module or feature is added in the future, it registers its actions and they automatically appear in the approval settings — **no changes to the Approval Engine needed**.

| Who Can Manage Rules | Permissions |
|---------------------|-------------|
| **Tenant SuperAdmin (CEO)** | Create, edit, delete rules for ALL companies. Can mark rules as **Mandatory** (Company Admin cannot disable). |
| **Company Admin** | Create, edit, delete rules for their OWN company only. Cannot disable Mandatory rules set by CEO. |

### Approval Rule Structure

Each rule contains:

| Field | Description |
|-------|-------------|
| **Name** | Custom display label (e.g., "Leave Approval", "Large PO Approval") |
| **Module** | Which module this applies to (HR, Sales, Purchasing, etc.) — dynamic dropdown from installed modules |
| **Action** | Which action within the module (e.g., Leave Request, Purchase Order) — dynamically registered by each module |
| **Approvers** | Who must approve — sequential checklist of roles (Manager → Company Admin → CEO). Can be 1 step or up to 3 steps. |
| **Active/Inactive** | Toggle to enable or disable the rule without deleting it |
| **Mandatory** | CEO-only flag — prevents Company Admins from disabling the rule |

### Multi-Step Sequential Approval

When multiple approvers are selected, approval proceeds in order from lowest role to highest:

- **1 approver checked:** Action → Approver → Done
- **2 approvers checked:** Action → Step 1 (Manager) → Step 2 (Company Admin) → Done
- **3 approvers checked:** Action → Step 1 (Manager) → Step 2 (Company Admin) → Step 3 (CEO) → Done

If any step **rejects**, the entire request is rejected and the requester is notified with the reason.

### Rule Management & History

| Capability | Description |
|-----------|-------------|
| **Create Rule** | Admin creates new approval rules from the Approval management screens |
| **Edit Rule** | Admin can modify the name, approvers, active status, or action of any rule |
| **Delete Rule** | Admin can remove rules (actions will proceed without approval) |
| **Rule History** | System tracks all changes to rules (who created, who modified, when, what changed) |
| **Approval Request History** | Full audit trail of all approval requests — who requested, who approved/rejected, when, comments |

### Example Approval Rules

| Rule Name | Module | Action | Approvers (Sequential) |
|-----------|--------|--------|----------------------|
| Leave Approval | HR | Leave Request | Step 1: Manager |
| New Hire Approval | HR | New Employee | Step 1: Manager → Step 2: Company Admin |
| Purchase Approval | Purchasing | Purchase Order | Step 1: Manager → Step 2: Company Admin |
| Payroll Approval | Payroll | Monthly Processing | Step 1: Company Admin → Step 2: CEO |
| Discount Approval | Sales | Invoice Discount | Step 1: Sales Manager |
| Journal Entry Approval | Accounting | Manual Journal Entry | Step 1: Company Admin |

---

## POS Integration

| Capability | Description |
|-----------|-------------|
| **Sales Sync** | POS transactions automatically create invoices in the ERP |
| **Payment Sync** | Payments recorded at POS reflect in accounting in real-time |
| **Inventory Updates** | Stock levels update automatically when POS records a sale |
| **Connection** | Standard REST API â€” any POS system supporting HTTP can connect |

---

## Security

| Area | Implementation |
|------|---------------|
| **Authentication** | Token-based with automatic expiry and renewal |
| **Passwords** | Hashed â€” never stored in plain text |
| **Data Isolation** | Enforced at database query level on every request |
| **Input Validation** | Every API input validated before processing |
| **Injection Prevention** | ORM-based queries â€” no raw SQL |
| **Encryption** | All communication over HTTPS (SSL/TLS) |
| **Rate Limiting** | Protection against brute-force attacks |

---

## UI Design & Brand Guidelines

The UI follows the official **Xorva Brand Guidelines (v1.0)** provided by OryxAI. The platform will use a strict dark theme with a purple accent.

### Color Palette
* **Void #0A0A0F**: Main page background
* **Abyss #13131C**: Cards, sidebar, modals background
* **Surface #1E1E2E**: Inputs, hover states, secondary cards
* **Xorva Purple #7C6FE0**: Primary buttons, logo, active states, links
* **Glow #A78BFA**: Hover states, focus rings, highlights
* **Frost #E2E2F0**: Primary text on dark backgrounds

### Typography
* **Primary Font**: Inter (Google Fonts)
* **Weights**: 400, 500, 600, 700, 800

### CSS Variables (Design Tokens)
\\\css
:root {
  /* Backgrounds */
  --bg-void: #0A0A0F;
  --bg-abyss: #13131C;
  --bg-surface: #1E1E2E;
  
  /* Brand */
  --color-purple: #7C6FE0;
  --color-glow: #A78BFA;
  
  /* Text */
  --text-primary: #E2E2F0;
  --text-secondary: #B0B0C0;
  --text-muted: #666680;
  
  /* Borders */
  --border: rgba(124,111,224,0.2);
  --border-hover: rgba(124,111,224,0.5);
  
  /* Radius */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
}
\\\

### Components & Icons
* **Icons**: Tabler Icons (outline style only, no filled variants).
* **Buttons**: Primary uses #7C6FE0, Danger uses #E24B4A. Corner radius 8px.
* **Cards**: Background #13131C, subtle purple border gba(124,111,224,0.2). Corner radius 16px.
* **Inputs**: Background #1E1E2E, focus ring uses Glow #A78BFA.

---

| | |
|---|---|
| **Status** | Approved — Architecture & Brand Guidelines Confirmed |

