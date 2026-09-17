# Xorva ERP — Day 5: UI, Dashboard & User Flows

**Date:** Saturday, July 18, 2026 (DEADLINE)  
**Status:** Days 1-4 COMPLETE. HR module is built.  
**Focus:** Dashboard, user flows, UI polish, full E2E.

---

## PART 1: HR Module Audit — What Claude Code Built

### Quick Verdict: ✅ HR Module is Built and Working

| Metric | Count | Status |
|--------|:-----:|:------:|
| Backend .cs files (HR module) | 39 | ✅ |
| Entities | 7 (Department, Designation, Employee, EmployeeHistory, Holiday, LeaveAllocation, LeaveRequest, LeaveType) | ✅ |
| Commands | 14 (Create/Update/Delete for each sub-module + ApplyLeave, CancelLeave, SeedLeaveTypes) | ✅ |
| Queries | 6 (ListDepartments, ListDesignations, ListEmployees, GetEmployee, GetMyProfile, LeaveQueries) | ✅ |
| Controllers | 5 new (Departments, Designations, Employees, Holidays, LeaveTypes, Leaves) | ✅ |
| Frontend pages | 5 new (DepartmentsPage, DesignationsPage, EmployeesPage, LeaveTypesPage, LeavePage) | ✅ |
| API client | `hr.api.ts` | ✅ |
| Migrations | 2 (HRPersonRegistry + HRLeaveManagement) | ✅ |
| Tests | **35 total** (25 unit + 10 integration, up from 32) | ✅ |
| Build | 0 errors, 0 warnings | ✅ |
| Approvable actions | 4 registered (CreateEmployee, SalaryChange, TerminateEmployee, LeaveRequest) | ✅ |
| Common utilities | EmployeeMapper, HrGuard, LeaveCalculator, LeaveHelpers | ✅ |

### What Was Built Per Spec

| Spec Requirement | Implemented? |
|-----------------|:-----------:|
| Department CRUD + hierarchy | ✅ |
| Designation CRUD + levels | ✅ |
| Employee CRUD + rich profile | ✅ |
| Employee Code auto-generation | ✅ |
| Emergency contact fields | ✅ |
| EmployeeHistory audit trail | ✅ |
| Holiday calendar | ✅ |
| Leave Types CRUD + seed | ✅ |
| Leave Apply + Cancel + Balance | ✅ |
| Approval engine integration | ✅ (4 actions) |
| `IXorvaDbContext` interface | ✅ (in build plan) |
| `CommandJson` encryption | Need to verify |
| `pendingDays` balance reservation | Need to verify |

---

## PART 2: What's Missing — The Day 5 Gap

### Current UI Problems

After auditing the frontend, here's what needs work TODAY:

| Problem | Current State | What It Should Be |
|---------|--------------|-------------------|
| **No landing page** | `/` redirects to `/dashboard` | Public landing page with "Sign Up" / "Log In" |
| **No sidebar** | Horizontal nav in header only | Professional ERP sidebar (collapsible) |
| **Flat navigation** | All links in one row | Grouped sidebar: Dashboard, Organization, HR, Approvals, Settings |
| **Dashboard is generic** | Same view for ALL roles (just shows user profile) | Role-specific dashboards with stats and widgets |
| **No module activation guard** | Employee can see HR nav even if HR not activated | Check company.modules before showing HR links |
| **No Employee profile page** | Route `/hr/employees/:id` missing | Tabbed employee profile view |
| **Max width too narrow** | `max-w-5xl` (64rem) in AppShell | ERP needs wider layout — `max-w-7xl` or full width with sidebar |

---

## PART 3: The Complete User Flow — From Landing to Working ERP

### 3.1 The Full Journey

```
┌─────────────────────────────────────────────────────────────────┐
│  LANDING PAGE (Public — /)                                      │
│  "Xorva ERP — Modern Cloud ERP for Multi-Entity Businesses"    │
│  [Sign Up Free] [Log In]                                        │
└────────────┬────────────────────────────────┬───────────────────┘
             │                                │
     ┌───────▼───────┐              ┌────────▼────────┐
     │  SIGN UP (/signup)          │  LOG IN (/login)  │
     │  Step 1: Org name           │  Email + Password │
     │  Step 2: Company name       │  → Dashboard      │
     │  Step 3: CEO account        │                   │
     │  → Auto-login → Dashboard  │                   │
     └───────┬───────┘              └─────────────────┘
             │
     ┌───────▼────────────────────────────────────────────────┐
     │  CEO DASHBOARD (First Login — empty state)              │
     │                                                         │
     │  "Welcome! Let's set up your organization."            │
     │                                                         │
     │  Step 1: ✅ Organization created                       │
     │  Step 2: ➡️ Create more companies (or skip)            │
     │  Step 3: ➡️ Activate modules per company               │
     │  Step 4: ➡️ Create branches                            │
     │  Step 5: ➡️ Add managers/employees                     │
     │  Step 6: ➡️ Set up departments & designations          │
     │  Step 7: ➡️ Configure approval rules (optional)        │
     │                                                         │
     │  [Get Started →]                                       │
     └────────────────────────────────────────────────────────┘
```

### 3.2 After Setup — Daily Usage Flow

```
CEO logs in        → Sees: company stats, pending approvals count, employee count, recent activity
CompanyAdmin logs in → Sees: company stats, pending approvals, HR summary, quick actions
Manager logs in    → Sees: team stats, team leaves, pending approvals, department summary
Employee logs in   → Sees: my profile summary, my leave balance, recent leave requests, announcements
SystemAdmin logs in → Sees: all tenants count, system health, recent signups (THIS IS US - Xorva team)
```

---

## PART 4: Role-Specific Dashboards — What Each User Sees

### 4.1 SystemAdmin Dashboard (Xorva Platform Team Only)

**Route:** `/dashboard` (when role = SystemAdmin)  
**Purpose:** Platform health and tenant management. This is the Xorva internal admin view.

| Widget | Data | Size |
|--------|------|:----:|
| Total Tenants | Count of all tenants on the platform | 1/4 |
| Total Companies | Count of all companies across all tenants | 1/4 |
| Total Users | Count of all ApplicationUsers | 1/4 |
| Recent Signups | Last 10 tenant registrations (name, date, company count) | 1/4 |
| System Health | API version, uptime, DB connection status | Full |

**Navigation for SystemAdmin:** Dashboard only. SystemAdmin doesn't manage HR/companies — they manage the PLATFORM.

> **Note:** SystemAdmin is the Xorva team (us). We will NEVER see HR, Departments, Companies, etc. We see platform metrics. This is a completely different dashboard from tenant users.

---

### 4.2 SuperAdmin (CEO) Dashboard

**Route:** `/dashboard` (when role = SuperAdmin)  
**Purpose:** Executive overview across ALL companies in the tenant.

| Widget | Data | Size |
|--------|------|:----:|
| Companies | Total companies count + list | 1/3 |
| Total Employees | Headcount across ALL companies | 1/3 |
| Pending Approvals | Count of items awaiting CEO's action | 1/3 |
| Company Breakdown | Cards per company: name, employee count, active modules | Full |
| Recent Activity | Last 10 actions across all companies (approvals, hires, leaves) | Full |
| Quick Actions | "Create Company", "Add Manager", "View All Approvals" | Sidebar |

**CEO sees EVERYTHING across all companies** — the global query filter's `HasCrossCompanyAccess = true` handles this.

**First-login onboarding checklist** (shown only when setup is incomplete):
- ✅ Organization created
- ⬜ Activate HR module
- ⬜ Create departments
- ⬜ Add first employee
- ⬜ Configure approval rules

---

### 4.3 CompanyAdmin (GM) Dashboard

**Route:** `/dashboard` (when role = CompanyAdmin)  
**Purpose:** Company management — THIS company only.

| Widget | Data | Size |
|--------|------|:----:|
| Employees | Total active employee count in company | 1/3 |
| Departments | Department count | 1/3 |
| Pending Approvals | Items awaiting GM's action | 1/3 |
| Department Summary | Table: Dept name, head, employee count | Full |
| Leave Summary | Today: X on leave, Y pending, Z approved this month | Half |
| Recent Hires | Last 5 employees added | Half |
| Quick Actions | "Add Employee", "View Departments", "Manage Leave Types" | Sidebar |

---

### 4.4 Manager Dashboard

**Route:** `/dashboard` (when role = Manager)  
**Purpose:** Team management — their department only.

| Widget | Data | Size |
|--------|------|:----:|
| My Team | Employee count in MY department | 1/3 |
| On Leave Today | Who's out today | 1/3 |
| Pending Approvals | Leave requests + other items in MY inbox | 1/3 |
| Team Members | List: name, designation, status, last leave | Full |
| Leave Calendar | Visual: who's on leave this week/month in my dept | Full |
| Quick Actions | "Approve Requests", "View Team" | Sidebar |

---

### 4.5 Employee Dashboard

**Route:** `/dashboard` (when role = Employee)  
**Purpose:** Self-service — MY data only.

| Widget | Data | Size |
|--------|------|:----:|
| My Profile Summary | Name, department, designation, join date | 1/2 |
| My Leave Balance | Cards per leave type: used / remaining | 1/2 |
| Recent Leave Requests | Last 5 leave requests (status badges) | Full |
| Quick Actions | "Apply for Leave", "View My Profile" | Centered |

**Employee sees NOTHING about other employees.** No company stats, no department lists, no other people's data.

---

## PART 5: Navigation Redesign — From Header Links to Professional Sidebar

### Current Problem
The `AppShell` has a flat horizontal nav in the header. With 12+ links, it wraps and looks unprofessional. An ERP needs a **sidebar**.

### Proposed Sidebar Structure

```
┌──────────────────────┬──────────────────────────────────────────┐
│   SIDEBAR (240px)    │   MAIN CONTENT AREA                     │
│                      │                                          │
│   🟣 XORVA ERP      │                                          │
│                      │                                          │
│   📊 Dashboard       │        (Role-specific dashboard)        │
│                      │                                          │
│   ── ORGANIZATION ── │                                          │
│   🏢 Companies      │                                          │
│   🏗 Branches        │                                          │
│                      │                                          │
│   ── HR ──────────── │                                          │
│   👥 Employees       │                                          │
│   🏛 Departments     │                                          │
│   📋 Designations    │                                          │
│   🌴 Leave           │                                          │
│   📅 Holidays        │                                          │
│   ⚙ Leave Types     │                                          │
│                      │                                          │
│   ── APPROVALS ───── │                                          │
│   📥 Pending         │                                          │
│   📜 Rules           │                                          │
│   📊 History         │                                          │
│                      │                                          │
│   ── ADMIN ───────── │                                          │
│   👤 Add User        │                                          │
│                      │                                          │
│   ────────────────── │                                          │
│   Ahmed Al-Mansouri  │                                          │
│   CEO • RightSource  │                                          │
│   [Sign Out]         │                                          │
└──────────────────────┴──────────────────────────────────────────┘
```

### Sidebar Visibility Rules Per Role

| Section | SystemAdmin | CEO | CompanyAdmin | Manager | Employee |
|---------|:-----------:|:---:|:------------:|:-------:|:--------:|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Organization** | | | | | |
| Companies | ❌ | ✅ | ✅ (read-only) | ❌ | ❌ |
| Branches | ❌ | ✅ | ✅ | ❌ | ❌ |
| **HR** (only if HR module active) | | | | | |
| Employees | ❌ | ✅ | ✅ | ✅ (own dept) | ❌ |
| Departments | ❌ | ✅ | ✅ | ✅ (read) | ❌ |
| Designations | ❌ | ✅ | ✅ | ❌ | ❌ |
| My Leave | ❌ | ❌ | ❌ | ✅ | ✅ |
| Leave Types | ❌ | ✅ | ✅ | ❌ | ❌ |
| Holidays | ❌ | ✅ | ✅ | ✅ (read) | ✅ (read) |
| **Approvals** | | | | | |
| Pending | ❌ | ✅ | ✅ | ✅ | ❌ |
| Rules | ❌ | ✅ | ✅ | ❌ | ❌ |
| History | ❌ | ✅ | ✅ | ✅ | ❌ |
| **Admin** | | | | | |
| Add User | ❌ | ✅ | ✅ | ❌ | ❌ |

---

## PART 6: Landing Page Concept

### For Phase 1 (Today — Fast Placeholder)

A simple but beautiful landing page. Not a marketing site — just enough to communicate value and drive signup.

```
┌─────────────────────────────────────────────────────────────┐
│  HEADER: Logo | [Log In] [Sign Up Free →]                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│           Modern Cloud ERP for                              │
│         Multi-Entity Businesses                             │
│                                                             │
│    Manage multiple companies, departments, and employees    │
│    from one platform. HR, Approvals, and more — built for   │
│    corporations that need control and visibility.            │
│                                                             │
│    [Get Started Free →]     [See Demo]                      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│    ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│    │ Multi-   │  │ HR &     │  │ Dynamic  │  │ Role-    │ │
│    │ Tenant   │  │ Leave    │  │ Approval │  │ Based    │ │
│    │          │  │ Mgmt     │  │ Engine   │  │ Access   │ │
│    └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  FOOTER: © 2026 Xorva ERP by OryxAI                       │
└─────────────────────────────────────────────────────────────┘
```

**Design:** Dark theme (Void background), purple accent, glassmorphism cards, subtle animations. Uses the existing Tailwind tokens.

---

## PART 7: Onboarding Flow — What Questions to Ask

### Current Signup (What Exists)

The current `/signup` page collects in ONE form:
1. Organization name (tenant)
2. Company name (first company)
3. CEO name + email + password

This creates: Tenant + Company + SuperAdmin atomically.

### What's Missing From the Onboarding

After signup, the CEO lands on a generic dashboard. There's NO guided setup. A 20-year architect would add:

### Proposed: Post-Signup Setup Wizard

**Not a separate page — a guided checklist ON the dashboard** (dismissable):

```
Step 1: ✅ Organization Created — "RightSource Group"
Step 2: ✅ First Company Created — "RightSource Trading"
Step 3: ⬜ Activate Modules → [Select Modules] → shows module picker
Step 4: ⬜ Create Branches → [Add Branch] → quick modal
Step 5: ⬜ Add Your First Department → [Create Department]
Step 6: ⬜ Add Your First Employee → [Add Employee]
Step 7: ⬜ (Optional) Set Up Approval Rules → [Configure]
```

Each step links directly to the relevant page. When all steps are done, the checklist auto-hides and shows the normal dashboard.

**Why a checklist, not a wizard:** Wizards block the user. A checklist lets them explore freely and come back. It's the GitHub / Stripe pattern — proven to work for SaaS onboarding.

### What We DON'T Ask During Signup

We keep signup MINIMAL (current is correct). Don't add:
- ❌ Module selection (they can do it after)
- ❌ Number of companies (they can add later)
- ❌ Industry/country (Phase 2)
- ❌ Anything that creates friction

**Principle:** Get them IN fast, guide them AFTER.

---

## PART 8: Prioritized Build List for Today

### P0 — Must Ship Today (Core)

| # | Task | Time Est | Why Critical |
|---|------|:--------:|-------------|
| 1 | **Sidebar navigation** (replace header nav) | 1.5 hr | Current nav doesn't scale, looks unprofessional |
| 2 | **Role-specific dashboard** (5 variants) | 2 hr | The dashboard is the FIRST thing users see |
| 3 | **Landing page** (placeholder but beautiful) | 1 hr | No public entry point currently |
| 4 | **Onboarding checklist** (CEO first-login) | 1 hr | New CEO gets a blank screen otherwise |
| 5 | **Update PROGRESS.md** with Day 4+5 | 0.5 hr | Documentation |

### P1 — Should Ship Today (Polish)

| # | Task | Time Est |
|---|------|:--------:|
| 6 | Employee profile page (`/hr/employees/:id`) | 1 hr |
| 7 | Module activation guard on HR nav items | 0.5 hr |
| 8 | `npm run build` verification | 0.25 hr |
| 9 | Final E2E test (signup → setup → create employee → leave → approve) | 0.5 hr |

### P2 — Nice to Have (If Time)

| # | Task |
|---|------|
| 10 | TanStack Query integration for HR pages |
| 11 | i18next initialization |
| 12 | Rate limiting middleware |
| 13 | Mobile responsive sidebar (hamburger menu) |

---

## PART 9: Dashboard API Endpoints Needed

To power role-specific dashboards, we need ONE new endpoint:

### `GET /api/dashboard/stats`

Returns different data based on the caller's role (JWT-aware):

**For CEO/SuperAdmin:**
```json
{
  "success": true,
  "data": {
    "companyCount": 3,
    "totalEmployees": 47,
    "pendingApprovals": 5,
    "recentHires": [...],
    "companySummary": [
      { "companyId": "...", "name": "Trading", "employeeCount": 25, "modules": ["HR","Accounting"] },
      { "companyId": "...", "name": "IT", "employeeCount": 22, "modules": ["HR"] }
    ]
  }
}
```

**For CompanyAdmin:**
```json
{
  "data": {
    "employeeCount": 25,
    "departmentCount": 5,
    "pendingApprovals": 3,
    "onLeaveToday": 2,
    "recentHires": [...],
    "departmentSummary": [...]
  }
}
```

**For Manager:**
```json
{
  "data": {
    "teamSize": 8,
    "onLeaveToday": 1,
    "pendingApprovals": 2,
    "teamMembers": [...]
  }
}
```

**For Employee:**
```json
{
  "data": {
    "profile": { "name": "...", "department": "...", "designation": "..." },
    "leaveBalance": [...],
    "recentLeaves": [...]
  }
}
```

This is ONE endpoint with role-based response shaping — clean, efficient, one API call on dashboard load.

---

## PART 10: Summary

### What We Have (Days 1-4):

| Day | Module | Status |
|-----|--------|:------:|
| 1 | Auth (JWT, RBAC, 5 roles) | ✅ |
| 2 | Tenants (Tenant → Company → Branch) | ✅ |
| 3 | Approval Engine (dynamic rules, pipeline interception) | ✅ |
| 4 | HR (Departments, Designations, Employees, Leave, Holidays) | ✅ |
| 5 | **Dashboard + UI + User Flows** | ⬅️ TODAY |

### What We're Building Today:

| Priority | Task | Impact |
|:--------:|------|--------|
| P0 | Sidebar navigation | Professional ERP layout |
| P0 | Role-specific dashboards (5 variants) | Users see relevant data immediately |
| P0 | Landing page (placeholder) | Public entry point |
| P0 | Onboarding checklist | CEO isn't lost after signup |
| P1 | Employee profile page | Complete HR user journey |
| P1 | Module activation guard | No broken nav links |

> **The backend is 95% done. Today is about making it LOOK and FEEL like a production ERP. The sidebar + dashboards + landing page transform this from "a set of API pages" into "a product."**
