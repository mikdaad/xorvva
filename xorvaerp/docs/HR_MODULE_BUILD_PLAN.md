# Xorva ERP — HR Module: Build Plan & Execution Playbook

**Companion to:** `HR_MODULE_SPECIFICATION.md` (the *what*) — this document is the *how*.
**Day:** 5 (Saturday, July 18, 2026) — the deadline. HR is Day-4 work executed today.
**Scope:** The COMPLETE HR module — the full specification **plus** the ERP-completeness
pieces the spec deferred — built to a professional, tested standard.

---

## 0. Where we start (the foundation is already done)

Days 1–3 are complete, on Neon, with **32/32 tests green**:

- **Auth** — register/login/JWT/refresh/RBAC (5 roles)
- **Tenants** — Tenant → Company → Branch, module activation, proven data isolation
- **Approval Engine** — dynamic rules, MediatR interception, deferred execution, inbox, history

HR plugs directly into all three. Nothing below re-does that work.

---

## 1. Architecture — how HR fits in cleanly (locked decisions)

### 1.1 Module-owned entities via `IXorvaDbContext`

HR **owns its own entities** (professional modular-monolith practice). To avoid a
circular dependency with the shared `XorvaDbContext` (which lives in Infrastructure),
we introduce one small abstraction:

- Add **`IXorvaDbContext`** to `Xorva.Core` — a thin interface exposing generic
  `Set<T>()`, `SaveChangesAsync()`, and transaction access.
- **HR entities are POCOs** in `Modules/Xorva.Modules.HR/Entities/`, extending
  `CompanyEntity` (Core). The HR module references **only Core + MediatR + FluentValidation** —
  no Infrastructure, no EF Core. That is true module isolation.
- The concrete `XorvaDbContext` (Infrastructure) references the HR module to register
  its entities and Fluent configurations.

**Dependency graph (no cycle):**
```
Core            (base entities, IXorvaDbContext, ICurrentTenantService, IApprovableAction)
HR      → Core
Infrastructure  → Core + HR        (concrete DbContext knows Employee, Department, …)
Auth/Tenants/Approvals → Infrastructure
API     → everything
```

**Zero rework of Days 1–3.** Existing modules keep using the concrete `XorvaDbContext`;
only HR uses `IXorvaDbContext`. They coexist.

**Two free wins from what we already built:**
- The global query filter auto-applies to any `CompanyEntity` subclass → **HR entities get
  tenant + company isolation automatically**.
- `SaveChanges` audit (CreatedBy/UpdatedBy/timestamps) applies automatically.

**Cross-module actions** (e.g. "create a login account for this employee") go through
**MediatR** (`RegisterUserCommand`), never a direct reference — modules never touch each other.

### 1.2 Step 0 security fix — encrypt the approval payload

Salary and password data flow through the approval engine's stored command
(`ApprovalRequest.CommandJson`). Before HR touches the engine we **encrypt that column
with ASP.NET Core `IDataProtector`** (encrypt on write in `ApprovalCheckBehavior`, decrypt
on replay in `ApproveRequestCommandHandler`). This protects salaries **and** retroactively
fixes the plaintext-password finding from the Day-3 audit.

---

## 2. Complete entity model (spec + ERP-completeness additions)

All entities extend `CompanyEntity` → automatic tenant/company isolation.

| Entity | Purpose | Source |
|--------|---------|--------|
| **Department** | Org structure; hierarchy via `ParentDepartmentId`, head via `HeadEmployeeId` | Spec |
| **Designation** | Job-title tier / pay grade (`Level` 1–10), independent of department | Spec |
| **Employee** | The person: personal, employment, bank, system fields | Spec |
| **HolidayCalendar + Holiday** | Company public holidays — excluded from leave-day math | **Added (ERP completeness)** |
| **EmployeeHistory** | Salary/position/status change audit trail (who, what, when, why) | **Added (ERP completeness)** |
| **LeaveType** | Leave categories (Annual/Sick/…), paid, carry-forward rules | Spec |
| **LeaveAllocation** | Per-employee, per-type, per-year balance (total/used/**pending**/remaining) | Spec |
| **LeaveRequest** | Apply/approve/cancel; links to `ApprovalRequest` | Spec |

**Employee — additions beyond the spec's profile:** `EmergencyContactName`,
`EmergencyContactPhone`, `EmergencyContactRelation`.

**Enums:** `Gender`, `MaritalStatus`, `EmploymentType`, `EmploymentStatus`, `LeaveStatus`.

---

## 3. Approvable HR actions (register with the Day-3 engine)

Each is one `AddSingleton(descriptor)` line in `AddHRModule()` → appears in the rule-builder
dropdowns under module **"HR"** (visible only to companies with HR activated).

| ActionKey | Action | Typical chain |
|-----------|--------|---------------|
| `HR.CreateEmployee` | New hire | Manager → CompanyAdmin |
| `HR.SalaryChange` | Salary update | CompanyAdmin → CEO |
| `HR.TerminateEmployee` | Termination | Manager → CompanyAdmin → CEO |
| `HR.LeaveRequest` | Employee leave | Manager |

---

## 4. Endpoints (complete)

**Departments** — `POST /api/departments`, `GET`, `GET /{id}`, `PUT /{id}`, `DELETE /{id}` (soft-delete; blocked if active employees).
**Designations** — `POST /api/designations`, `GET` (by level), `PUT /{id}`, `DELETE /{id}`.
**Employees** — `POST /api/employees` (approvable), `GET` (paged + filter), `GET /{id}`, `GET /me`, `PUT /{id}`, `PUT /{id}/status` (approvable), `PUT /{id}/salary` (approvable).
**Holidays** — `POST /api/holidays`, `GET`, `DELETE /{id}`.
**Leave Types** — `POST /api/leave-types`, `GET`, `PUT /{id}`, `DELETE /{id}`.
**Leaves** — `POST /api/leaves` (approvable), `GET /me`, `GET /balance`, `GET` (team/company), `PUT /{id}/cancel`.

`GET /api/employees` filters: `page, pageSize, search, departmentId, designationId, status, employmentType, sortBy, sortDir`.

---

## 5. RBAC (per the specification's matrix)

- **CompanyAdmin / CEO** — full HR management in company (create employees, departments, designations, leave types, holidays).
- **Manager** — manage/list employees in **their own department**; approve their team's leave (via inbox).
- **Employee** — `GET /me`, apply for leave, view own balance.
- **Approval rules are the configurable control layer** — admins gate New Hire / Salary / Termination / Leave when they want sign-off.

---

## 6. Edge cases — designed against from the start

| # | Edge case | Handling |
|---|-----------|----------|
| 1 | Salary/password in approval payload | Encrypt `CommandJson` (Step 0) |
| 2 | `EmployeeCode` generation race | Unique `(CompanyId, Code)` index + generate-and-retry |
| 3 | Department ↔ Employee circular FK | `HeadEmployeeId` nullable; set after employee exists |
| 4 | `ReportingToId` = self / cycle | Reject self; shallow cycle guard |
| 5 | Cross-company references (dept, designation, branch, reportingTo, user) | Validate each is in the caller's company |
| 6 | Soft-delete vs. query filter | HR list queries exclude `IsActive = false` by default |
| 7 | Leave balance double-draw | Reserve **pendingDays** at submit; commit on approval; release on reject/cancel |
| 8 | Leave day count | Exclude weekends + Holiday calendar entries |
| 9 | Overlapping leave | Reject overlap with existing pending/approved leave |
| 10 | Pagination bounds | `page ≥ 1`, `pageSize` capped (e.g. 100), stable ordering |
| 11 | Salary as money | `decimal(18,2)`, never float |
| 12 | Manager acting outside own department | Forbidden |

---

## 7. Build order (tiered — green build at every checkpoint)

**Step 0 — Foundations**
- `IXorvaDbContext` in Core; `IDataProtector` encryption of `CommandJson`.
- ✅ Checkpoint: solution builds 0/0, existing 32 tests still pass.

**Tier 1 — The person registry**
- Entities: Department, Designation, Employee (+ emergency contact), EmployeeHistory.
- Department + Designation CRUD; Employee CRUD (rich profile, pagination/filter, `/me`, status, salary).
- Approvable: CreateEmployee, SalaryChange, TerminateEmployee.
- Migration to Neon.
- ✅ Checkpoint: build 0/0; unit + integration tests (cross-company reject, dept-delete-restrict, code race, approval integration).

**Tier 2 — Leave management (the approval showcase)**
- Entities: HolidayCalendar/Holiday, LeaveType, LeaveAllocation, LeaveRequest.
- Leave Types (+ default seed), Holidays CRUD, Allocation/balance, Leave apply/cancel/balance with reservation.
- Approvable: LeaveRequest.
- Migration to Neon.
- ✅ Checkpoint: build 0/0; tests incl. "leave → manager approves → recorded + balance updated".

**Tier 3 — Frontend**
- Departments, Designations, Employees (list + multi-section form + profile), Leave (apply + balances), Leave Types config — Tailwind, role-gated nav.
- ✅ Checkpoint: `npm run build` passes; proxy E2E.

---

## 8. Testing plan

**Automated (xUnit):** unit tests per handler (CRUD, validation, cross-company rejection,
dept-delete-restrict, EmployeeCode race, leave balance math) + integration over real HTTP
(the plan's headline: *Create Employee / Leave triggers approval when a rule exists*).

**Swagger** (`/swagger`, Authorize button already wired): manual sweep of every endpoint.

**Postman:** import `swagger.json`, set Bearer token; a click-by-click script per module.

**Frontend / browser:** drive the full flow (below) and confirm each page renders and works
through the Vite proxy.

---

## 9. End-to-end user flow (what a demo looks like)

```
Corporation signs up (/signup)
  → CEO lands on dashboard
  → CEO creates Companies + Branches, activates the HR module
  → CompanyAdmin sets up Departments + Designations + Holidays + Leave Types
  → HR adds Employees (some linked to login accounts)
  → CompanyAdmin (optionally) creates approval rules: New Hire, Leave, Salary
  → Employee logs in → applies for Leave
  → Manager sees it in Pending Approvals → approves
  → Leave recorded, balance updated, visible in "My Leaves"
```

This is the complete journey from an empty system to a working HR department.

---

## 10. Phase 2 (deferred — needs infrastructure we haven't set up)

Attendance (shift/biometric/overtime engine), Document management (Cloudinary file upload),
Payroll structure (separate module), Loans, End-of-service Gratuity, Training. The
specification correctly defers these; adding them today is not feasible.

---

> **This playbook is the execution companion to `HR_MODULE_SPECIFICATION.md`. Build order,
> checkpoints, edge cases, and testing are fixed. Ready to execute.**
