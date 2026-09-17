# Xorva ERP — Phase 1: Architecture & Foundation

**Project:** Xorva ERP (Multi-Tenant Cloud ERP)
**Phase:** Phase 1 (Auth, Tenant Foundation, and HR Module)
**Architecture:** .NET Modular Monolith (Core + Separate Module Projects)
**Status:** Ready for Lead Approval

---

## 1. The Architecture (Modular Monolith)

To ensure maximum scalability for a massive SaaS ERP, we are using a **Modular Monolith** architecture. This provides strict physical isolation between different business departments.

The solution is divided into **Shared Core Projects** and **Independent Module Projects**:

### The Shared Core
1. **Xorva.Core:** Contains shared rules, base entities (like `Tenant`), and global constants. 
2. **Xorva.Infrastructure:** Handles the PostgreSQL database connection (EF Core) and external services.
3. **Xorva.API:** The central web project that receives HTTP requests and routes them to the correct module.

### The Modules
Each business feature gets its very own `.NET Project`.
*   **Xorva.Modules.Auth:** Handles login, registration, and JWT tokens.
*   **Xorva.Modules.Tenants:** Handles organization creation and settings.
*   **Xorva.Modules.HR:** Handles employees, departments, and payroll.

*(Dependency Direction: Module projects reference the `Xorva.Core`. The `Xorva.API` references all Modules and `Xorva.Infrastructure` to wire the application together.)*

---

## 2. Why Modules as Projects?

By making HR, Auth, and Sales into separate `.csproj` projects instead of just folders, we gain massive enterprise benefits:
*   **Physical Isolation:** The compiler prevents the HR code from accidentally modifying Accounting code.
*   **Microservices Ready:** If the ERP grows to millions of users, we can easily drag the `Xorva.Modules.HR` project out and host it as its own independent microservice.
*   **Team Velocity:** Different developer teams can work on different module projects simultaneously without causing code conflicts.

---

## 3. Phase 1 Scope (Detailed Deliverables)

For Phase 1, we are building the foundation and the first module (HR). 

### Foundation (Auth & Tenants)
1. **System Setup:** Create the Modular Monolith solution and connect to PostgreSQL.
2. **Tenant Registration (`POST /api/tenants`):** Create a new company/organization workspace.
3. **User Registration (`POST /api/auth/register`):** Invite users to join a specific tenant.
4. **User Login (`POST /api/auth/login`):** Authenticate and generate a secure JWT Token.
5. **Data Isolation (Multi-Tenancy):** Configure EF Core so users from Company A can never see data from Company B.
6. **Role-Based Access Control:** Define strict permissions for Admin, Manager, and Employee roles.
7. **Company Settings (`PUT /api/tenants/settings`):** Update company profile, currency, and timezones.

### Core Feature: Dynamic Approval Engine (Xorva.Core)
8. **Approval Rule CRUD (`/api/approval-rules`):** Create, read, update, delete approval rules. Only Company Admin and CEO can manage.
9. **Dynamic Module & Action Registration:** Each module registers its approvable actions at startup. Approval dropdown options populated dynamically.
10. **Multi-Step Sequential Approval:** Support 1-3 step approval chains (Manager → Company Admin → CEO). Automatic progression through steps.
11. **Pending Approvals Inbox (`GET /api/approvals/pending`):** Approvers see all items waiting for their action with Approve/Reject actions.
12. **Approval & Rule History (`GET /api/approvals/history`):** Full audit trail of all approval requests and rule changes.
13. **Core Pipeline Integration:** Approval check layer intercepts all module actions automatically — zero approval code inside modules.

### First Module (HR)
14. **Create Department (`POST /api/departments`):** Add departments (e.g., IT, Sales, Accounting).
15. **List Departments (`GET /api/departments`):** View all departments in the company.
16. **Create Employee (`POST /api/employees`):** Add a new employee record.
17. **Update Employee (`PUT /api/employees/{id}`):** Update employee details (salary, position).
18. **Assign to Department:** Link the employee to a specific department.
19. **List Employees (`GET /api/employees`):** View all employees with filtering and pagination.

---

## 4. Tenant Hierarchy (How Customers Use the System)

A **Tenant** is the top-level account. It represents the entire Corporation/Group.

```text
Tenant: RightSource Group          (1 Tenant = 1 Customer Account)
  Company 1: RightSource Trading   (Each company picks its own modules)
      Branch: Dubai Office
      Branch: Abu Dhabi Office
  Company 2: RightSource IT
      Branch: Sharjah Office
  Company 3: RightSource Consulting
      Branch: Riyadh Office
```

**Modules are activated per Company:**

| Company | Activated Modules |
|---------|-------------------|
| RightSource Trading | Accounting, Sales, Inventory, Purchasing |
| RightSource IT | HR, Payroll, Accounting |
| RightSource Consulting | HR, Accounting, Reports |

---

## 5. Roles & Permissions (5 Levels)

| # | Role | Scope | Who Is This Person |
|---|------|-------|--------------------|
| 1 | **System Admin** | All Tenants | **Us** (Xorva platform owners). Manages subscriptions and billing. |
| 2 | **Tenant SuperAdmin** | All Companies in Tenant | **The CEO**. Sees everything, approves payroll and big purchases. |
| 3 | **Company Admin** | One Company Only | **General Manager**. Manages users and modules for their company only. |
| 4 | **Manager** | One Department Only | **Department Head**. Approves leave, manages department data. |
| 5 | **Employee** | Self Only | **Regular Staff**. Views own profile, applies for leave. |

```text
[System Admin] -- Xorva Team
    |
    [Tenant SuperAdmin] -- CEO of RightSource
            |
            [Company Admin] -- GM of Trading
            |       [Manager] -- Sales Manager
            |               [Employee] -- Salesman Ahmed
            |       [Manager] -- HR Manager
            |               [Employee] -- HR Staff Sara
            |
            [Company Admin] -- GM of IT Solutions
            |       [Manager] -- IT Manager
            |               [Employee] -- Developer Ali
            |
            [Company Admin] -- GM of Consulting
                    [Manager] -- Consulting Lead
                            [Employee] -- Consultant Fatima
```

---

## 6. Dynamic Approval Engine (Core Pipeline Feature)

The Approval Engine is a **core infrastructure feature** built into **Xorva.Core** at the same level as Authentication and Multi-Tenancy. It sits in the request pipeline and **automatically intercepts all module actions** — modules have zero approval code inside them.

### How It Works

1. **Company Admin or CEO** creates an **Approval Rule** from the Approval management screens.
2. Each rule contains: **Name** (custom label) + **Module** (dynamic dropdown) + **Action** (dynamically registered by each module) + **Who Approves** (role checklist, sequential multi-step).
3. The Core pipeline **automatically enforces** the rule — when a matching action is detected, the system saves it as **"Pending"** and notifies the first approver.
4. Approvers review from their **Pending Approvals inbox** and click **Approve** or **Reject**.
5. Multi-step approval proceeds sequentially (Step 1 → Step 2 → Step 3). If any step rejects → entire request rejected. When all steps approve → action executes automatically.

### Dynamic Registration (No Hardcoding)

Rules are NOT hardcoded. Each module **registers its own approvable actions** with the Approval Service at startup. When new modules or features are added in the future, they register their actions and they automatically appear in the approval settings — **no changes to the Approval Engine needed.**

### Who Can Manage Rules

| Role | Can Do |
|------|--------|
| **CEO (Tenant SuperAdmin)** | Create, edit, delete rules for ALL companies. Can mark rules as **Mandatory** (Company Admin cannot disable). |
| **Company Admin** | Create, edit, delete rules for OWN company only. Cannot disable Mandatory rules set by CEO. |

### Approval Rule Fields

| Field | Description |
|-------|-------------|
| **Name** | Custom display label typed by admin (e.g., "Leave Approval") |
| **Module** | Dropdown of installed modules (HR, Sales, etc.) — dynamically populated |
| **Action** | Dropdown of actions for selected module (e.g., Leave Request) — dynamically registered by each module |
| **Approvers** | Sequential role checklist: Manager → Company Admin → CEO (1 to 3 steps) |
| **Active/Inactive** | Toggle ON/OFF without deleting |
| **Mandatory** | CEO-only flag — prevents Company Admin from disabling |

### Multi-Step Sequential Approval

- **1 approver:** Action → Approver → Done
- **2 approvers:** Action → Manager → Company Admin → Done
- **3 approvers:** Action → Manager → Company Admin → CEO → Done
- If any step **rejects** → entire request rejected with reason.

### Rule Management & History

- **CRUD Operations:** Create, Edit, Delete approval rules
- **Rule History:** Tracks who created/modified rules, when, and what changed
- **Approval Request History:** Full audit trail — who requested, who approved/rejected, when, comments

### Example Rules

| Rule Name | Module | Action | Approvers |
|-----------|--------|--------|-----------|
| Leave Approval | HR | Leave Request | Manager |
| New Hire Approval | HR | New Employee | Manager → Company Admin |
| PO Approval | Purchasing | Purchase Order | Manager → Company Admin |
| Payroll Approval | Payroll | Monthly Processing | Company Admin → CEO |

---

## 7. Next Steps to Start Coding

Once this document is approved by your lead, we will run these terminal commands to generate the exact Modular Monolith structure:

```bash
# 1. Create the blank solution
dotnet new sln -n XorvaERP

# 2. Create the Shared Core Projects
dotnet new classlib -n Xorva.Core -o src/Xorva.Core
dotnet new classlib -n Xorva.Infrastructure -o src/Xorva.Infrastructure
dotnet new webapi -n Xorva.API -o src/Xorva.API

# 3. Create the Phase 1 Module Projects
dotnet new classlib -n Xorva.Modules.Auth -o src/Modules/Xorva.Modules.Auth
dotnet new classlib -n Xorva.Modules.Tenants -o src/Modules/Xorva.Modules.Tenants
dotnet new classlib -n Xorva.Modules.HR -o src/Modules/Xorva.Modules.HR

# 4. Add all projects to the solution
dotnet sln add src/Xorva.Core src/Xorva.Infrastructure src/Xorva.API
dotnet sln add src/Modules/Xorva.Modules.Auth src/Modules/Xorva.Modules.Tenants src/Modules/Xorva.Modules.HR

# 5. Set up dependencies (Module references Core, API references everything)
dotnet add src/Modules/Xorva.Modules.Auth reference src/Xorva.Core
dotnet add src/Modules/Xorva.Modules.HR reference src/Xorva.Core
dotnet add src/Xorva.API reference src/Modules/Xorva.Modules.Auth
dotnet add src/Xorva.API reference src/Modules/Xorva.Modules.HR
dotnet add src/Xorva.API reference src/Xorva.Infrastructure
```

**Approval Request:** Does this Modular Monolith architecture and Phase 1 scope look good to proceed?
