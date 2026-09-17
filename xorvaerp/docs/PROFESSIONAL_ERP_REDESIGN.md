# Xorva ERP — Making It a Real, Workable ERP (Redesign Spec)

**Trigger:** first hands-on review of the UI. Feedback (paraphrased):
- CEO and Company-Admin dashboards feel the same.
- Sidebar isn't module-style — it should group features under their MODULE (select HR → an "HR"
  section with all HR features inside it).
- Roles are unclear — SuperAdmin / Admin / Manager / Employee: where is each used, and each should
  see different things suited to their job.
- Make it a professional, modern, *workable* ERP where the organization is truly connected:
  tenant → companies → company admins → managers → employees.

**Verdict:** the feedback is correct. We built the *capabilities*; what's thin is the *connective
tissue* that makes an org come alive. This spec fixes navigation, role clarity, and — most
importantly — the relationships between people and the org structure.

---

## 1. Root-cause analysis (as an ERP developer)

| Symptom | Root cause | Fix |
|---|---|---|
| Dashboards feel the same | Same visual template; only numbers differ | Distinct per-role dashboards (different widgets + intent), §4 |
| Sidebar isn't module-style | Nav grouped by generic category (People, Leave), not by MODULE | Module-based collapsible nav, §3 |
| "Where is Manager used?" | A Manager user is never assigned a **department** in the UI → no team → empty inbox → role looks pointless | Assign department when creating a Manager, §5 |
| Employee login feels empty | "Add User" creates a **login** but not an **employee record**; the two aren't linked | Person-centric create: employee + optional login together, §5 |
| Org feels disconnected | Tenant→Company→Department→Manager→Employee→login chain is only half-wired | Wire every link, §5 |

**The core realization:** in a real ERP the **person is the center**. Employees are people; a login
is an *access grant* on top of a person. We built logins (Users) and HR records (Employees) as two
separate islands. Bridging them is what makes the system workable.

---

## 2. The role model — crisp definitions (so the UX can express them)

| Role | Who | Scope | Primary job | Lands on |
|---|---|---|---|---|
| **System Admin** | Xorva team (us) | Platform | Operate the platform (tenants, health) | Platform console |
| **CEO / SuperAdmin** | Corporation owner | Whole tenant | Build & oversee companies; consolidated view | Executive dashboard |
| **Company Admin / GM** | Runs one company | One company | Company operations: people, structure, approvals | Company ops dashboard |
| **Manager** | Department head | One department | Manage & approve for their team | Team dashboard |
| **Employee** | Staff | Self | Self-service: profile, leave | Self-service dashboard |

The relationships that must be **visible and wired**:
```
Tenant (RightSource Group)
 └── Company (RightSource Trading)  ── run by → Company Admin
      └── Department (Sales)        ── headed by → Manager
           └── Employee (Ahmed)     ── may have → Login (role Employee)
```

---

## 3. Module-based navigation (the big UX change)

Replace category groups with **module sections**. The sidebar is driven by the **active company's
activated modules** + core sections that are always present per role.

```
  Dashboard                         ← always

  ▼ HR            (shown only if company has "HR" active — collapsible)
     Employees
     Departments
     Designations
     Leave  ▸  My Leave · Leave Types · Holidays
  ▼ Accounting    (Phase 2 — appears when activated)
  ▼ Sales         (Phase 2)

  ▼ Approvals     (core, always for approvers)
     Inbox · Rules · History

  ▼ Organization  (CompanyAdmin+ )
     Companies · Branches · Users
```

Rules:
- **Modules are collapsible groups**, expanded by default when you're inside one.
- A module group appears only if the **active company** has that module activated (real ERP behavior).
- **Approvals** and **Organization/Settings** are core (not a business module) — always available per role.
- Switching the active company (header switcher) re-evaluates which module groups show.
- **Employee** role: sees a slim sidebar — Dashboard + My Leave (their self-service slice of HR).

---

## 4. Role-differentiated dashboards (not just different numbers)

Each dashboard has a distinct **intent** and layout.

### System Admin — Platform console
Tiles: Tenants · Companies · Users · Employees. Widget: recent signups. (Read-only, distinct look.)

### CEO — Executive (consolidated, multi-company)
- Hero row: Companies · Total headcount · Pending approvals · Active modules
- **Company comparison** table/bars: per company → headcount, departments, modules, on-leave
- Pending approvals preview · Getting-started (until set up)
- Actions: New Company · Assign Company Admin · Approval Rules
- *Framing: strategic, whole-group.*

### Company Admin — Operations (one company)
- Tiles: Employees · Departments · Pending approvals · On leave today
- **Org snapshot**: departments with head + headcount
- Recent hires · Pending approvals · "Who's out today"
- Actions: Add Employee · Assign Manager · New Department
- *Framing: run my company day-to-day.*

### Manager — My team
- Tiles: Team size · On leave today · Pending in my inbox
- **My team** list (name, designation, status) · leave calendar for the team this week
- My approval inbox front-and-center
- Actions: Review approvals · Add team member (if allowed)
- *Framing: my department only.*

### Employee — Self-service
- Big greeting + **profile card** · **leave balance cards** · my recent requests
- One prominent **"Apply for Leave"**
- *Framing: just my stuff — no company data.*

---

## 5. Wiring the org — the "workable" fixes (most important)

### 5.1 Person-centric people creation
Primary flow becomes **"Add Person"** (in HR → Employees): capture the person, their **department**,
**designation**, and role; optionally **"Grant system access"** (email + password + role) which
creates a **linked login** in one step.

Backend: `CreateEmployee` optionally creates a linked `ApplicationUser` (via MediatR `RegisterUser`,
bypassing nested approval) with the chosen role, the company, and the **department**; sets
`Employee.UserId`. Result: the employee can log in and self-serve; a Manager is created *with* a
department.

Keep a lean **"Add User"** for people who need a login but aren't employees (e.g. an extra admin).

### 5.2 Manager → Department (fixes the empty inbox)
A Manager must have a `DepartmentId`. Set it when creating the manager (person flow above) or via an
**"Assign manager"** action on a Department. Manager scoping already reads `User.DepartmentId` — once
it's set, their team list, dashboard, and leave-approval inbox all work.

### 5.3 Company Admin → Company, CEO → all
- CEO assigns a **Company Admin** per company (a user with role CompanyAdmin + that company). Surface
  this as "Assign Company Admin" from the company view.
- Make the hierarchy **visible**: a company page shows its admin, departments, managers, headcount —
  so the org chart is legible.

### 5.4 The end-to-end flow that must "just work"
```
CEO signs up → onboarding: create companies + pick modules
CEO → assign a Company Admin to each company
Company Admin → create Departments + Designations
Company Admin → add Managers (person + login + department)
Manager/Admin → add Employees (person + optional login + department)
Company Admin → seed Leave Types; (optionally) create approval rules
Employee → logs in → applies for leave
Manager → sees it in inbox → approves → balance updates
CEO → sees consolidated headcount + activity
```

---

## 6. Build plan (proposed order)

1. **Module-based sidebar** (collapsible module groups, active-company modules, per-role slices). Biggest visible win.
2. **Wire people**: `CreateEmployee` optional linked-login (role + department); "Add Person" form; "Assign Manager" on a Department; department field where needed. Backend + frontend. *(makes Manager/Employee real)*
3. **Role-differentiated dashboards** (5 distinct layouts per §4).
4. **Make relationships visible**: company page shows admin/departments/managers; department page shows head + team.
5. **Polish pass** + manual E2E of the full chain (§5.4). Keep the 35 tests green; add a couple for linked-login.

---

## 7. Scope note

This is meaningful work but mostly **UX + wiring on top of existing capabilities** — not new
subsystems. It converts "a set of working modules" into "a connected organization you can run."
No new business domains (Accounting/Sales/Attendance stay Phase 2).
