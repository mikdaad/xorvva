# HR Module Docs Comparison — Spec vs Build Plan

**Date:** Saturday, July 18, 2026 (DEADLINE DAY)  
**Current Status:** HR Module = **0 files implemented.** Backend folder is empty.  
**Time Available:** Today only.

---

## 1. What Each Document Is

| | [HR_MODULE_SPECIFICATION.md](file:///c:/Users/HP/Desktop/xorvaErp/docs/HR_MODULE_SPECIFICATION.md) | [HR_MODULE_BUILD_PLAN.md](file:///c:/Users/HP/Desktop/xorvaErp/docs/HR_MODULE_BUILD_PLAN.md) |
|---|---|---|
| **Author** | Me (Antigravity) | Claude Code |
| **Purpose** | The **WHAT** — entity designs, field tables, API contracts, business rules | The **HOW** — build order, architecture decisions, edge cases, testing plan |
| **Length** | 752 lines (detailed) | 214 lines (focused) |
| **Grade** | ✅ Professional spec | ✅ Professional execution plan |

They are **companions**, not competitors. The SPECIFICATION defines every field, every endpoint, every DTO. The BUILD PLAN says "here's the order to build it, here are the gotchas, here's how to test."

---

## 2. What Claude's BUILD PLAN Added Beyond My SPECIFICATION

Claude Code read my specification and then **added things I missed**. Credit where it's due:

| Addition | What It Is | My Assessment |
|----------|-----------|---------------|
| **`IXorvaDbContext` interface** (§1.1) | Abstracts DbContext so HR module doesn't reference Infrastructure directly. HR handlers inject `IXorvaDbContext` instead of concrete `XorvaDbContext`. | ✅ **Excellent.** This is true module isolation. Prevents circular dependency: `HR → Core` only, never `HR → Infrastructure`. The dependency graph becomes clean: `Infrastructure → Core + HR`. |
| **`CommandJson` encryption** (§1.2) | Encrypt the approval payload with `IDataProtector` because salary data flows through `ApprovalRequest.CommandJson`. | ✅ **Critical security fix.** Salary amounts are sensitive — storing them as plaintext JSON in the database is a real vulnerability. Good catch. |
| **`HolidayCalendar` + `Holiday` entities** (§2) | Company public holidays — excluded from leave-day calculations. | ✅ **ERP completeness.** Without this, leave day count is just calendar days (including holidays). That's wrong in production — a 5-day leave request (Mon-Fri) where Wednesday is a public holiday should count as 4 days, not 5. |
| **`EmployeeHistory` entity** (§2) | Audit trail for salary, position, status changes (who changed what, when, old value → new value). | ✅ **Enterprise standard.** Every real HR system tracks "Ahmed's salary changed from 15000 → 18000 on July 1 by Sara (HR Manager)." Without this, there's no audit trail for compliance. |
| **Emergency contact fields** (§2) | `EmergencyContactName`, `EmergencyContactPhone`, `EmergencyContactRelation` on Employee. | ✅ **Standard.** Every HR system needs this. I missed it. |
| **`pendingDays` in LeaveAllocation** (§6 edge case #7) | Reserve balance at submit, not at approval. Prevents two employees from submitting for the same days and both getting approved. | ✅ **Race condition fix.** Without `pendingDays`, balance goes: 25 remaining → Ahmed submits 5 (still shows 25) → Sara also submits 5 (still shows 25) → both approved → actual used = 10, but each thought they had 25. With `pendingDays`: Ahmed submits → pending=5, remaining shows 20 → Sara can only take 20. |
| **`PUT /api/employees/{id}/salary`** (§4) | Separate salary-change endpoint (approvable). | ✅ **Correct.** Salary change is a different approval flow from general profile update. You don't want every profile edit to trigger CEO approval — only salary changes. |
| **Holidays CRUD endpoints** (§4) | `POST /api/holidays`, `GET`, `DELETE /{id}`. | ✅ **Needed.** My spec has leave types but forgot holidays. |
| **EmployeeCode race condition handling** (§6 edge case #2) | Generate-and-retry with unique index. If two employees are created simultaneously, the second gets a retry with the next code. | ✅ **Production-grade.** Concurrent requests in a multi-user ERP will cause code collisions. |
| **Tiered build order with checkpoints** (§7) | Step 0 → Tier 1 (person registry) → Tier 2 (leave) → Tier 3 (frontend). Green build at every checkpoint. | ✅ **Practical.** Ensures nothing breaks along the way. |

---

## 3. What's in BOTH Documents (Agreement)

Both docs agree on these core decisions — **no conflicts**:

| Area | Both Say |
|------|----------|
| 4 sub-modules for Phase 1 | Departments, Designations, Employees, Leave Management |
| Attendance = Phase 2 | Too complex for today |
| Module-owned entities | `Modules/Xorva.Modules.HR/Entities/`, NOT in Core |
| Base class | All HR entities extend `CompanyEntity` |
| Employee ≠ User | Optional 1:1 via `Employee.UserId?` |
| Approvable actions | HR.CreateEmployee, HR.LeaveRequest, HR.TerminateEmployee, HR.SalaryChange |
| Leave balance tracking | LeaveAllocation per employee per type per year |
| Default leave types | Seed 5 types (Annual 30d, Sick 15d, Unpaid 0d, Maternity 90d, Emergency 5d) |
| Folder structure | Commands/, Queries/, DTOs/, Entities/, Enums/, Extensions/ |
| RBAC matrix | CompanyAdmin+ for management, Manager for own dept, Employee for self |
| Indexes | Same composite unique indexes on (CompanyId, Name/Code) |
| Phase 2 deferred | Attendance, Documents, Payroll, Loans, Gratuity, Training |

---

## 4. What's Missing from BOTH Documents

After deep analysis as a 20-year architect, here's what neither document covers:

| Gap | Why It Matters | Priority |
|-----|---------------|:--------:|
| **Leave day calculation logic** | How exactly to count days? Exclude weekends? Which weekends (Fri-Sat for UAE, Sat-Sun for US)? The build plan mentions excluding holidays but neither doc specifies weekend rules per company. | 🟡 Medium — for today, use simple calendar day count. Add weekend config in Phase 2. |
| **Employee Code format configuration** | Both say "EMP-0001" but is the prefix configurable per company? Some companies want "RTS-0001" or "IT-0001". | 🟢 Low — hardcode "EMP-" for Phase 1. Make configurable in Phase 2. |
| **Bulk leave allocation** | When a new year starts, who creates allocations for all employees? Manual? Auto? | 🟡 Medium — for today, auto-create when employee is created. Year rollover is Phase 2. |
| **Leave request → approval engine serialization** | The ApplyLeaveCommand needs `EmployeeId` — but when the approval engine replays it, is the employee resolved from JWT or from the command? | 🔴 High — must be from the serialized command (the original requester). The build plan's `IXorvaDbContext` approach handles this. |
| **Frontend: TanStack Query** | Both docs list frontend pages but neither says whether to use TanStack Query or raw axios. Progress.md says "installed but not wired." | 🟡 Medium — USE IT for HR pages. This is the right time to wire it. |
| **Module activation guard** | What happens if someone hits `/api/employees` but the company doesn't have HR activated? The docs don't specify a middleware or check for this. | 🟡 Medium — add a simple check in the HR controllers: if company modules don't include "HR", return 403. |

---

## 5. Is It Professional? Is It System Architect Level?

### My SPECIFICATION (the WHAT): ✅ YES — 8.5/10

**Strengths:**
- Complete field-level entity tables with types, constraints, and rationale
- Full API contracts with request/response JSON shapes
- Mermaid ERD showing relationships
- RBAC access matrix per endpoint
- Clear Phase 1 / Phase 2 boundary
- Business rules per entity

**Gaps (addressed by Claude's build plan):**
- No `IXorvaDbContext` (architecture decision for module isolation)
- No `CommandJson` encryption (security)
- No holidays / employee history (completeness)
- No edge case analysis
- No build order / execution strategy

### Claude's BUILD PLAN (the HOW): ✅ YES — 9/10

**Strengths:**
- `IXorvaDbContext` abstraction = genuine modular monolith expertise
- Security fix (encrypt CommandJson) before touching salary data
- Added HolidayCalendar + EmployeeHistory (ERP experience)
- 12 edge cases with handling strategies
- Tiered build order with green-build checkpoints
- E2E demo flow showing the complete user journey
- "Zero rework of Days 1-3" guarantee

**Gaps:**
- No field-level entity tables (relies on the spec for that)
- No API request/response JSON shapes (relies on the spec)
- No DTO definitions

### Together: **9.5/10** — This is genuine 20-year architect work.

The two documents complement each other perfectly. The spec gives the **complete contract** (what to build). The build plan gives the **execution strategy** (how to build it safely with zero regression). A 20-year architect would produce exactly this pair: one document for the dev team, one for the tech lead.

---

## 6. FINAL MERGED BUILD LIST — What to Build TODAY

Combining both documents + the gaps I identified, here is the **complete, ordered work list**:

### Step 0: Foundation (30 min)
- [ ] `IXorvaDbContext` interface in `Xorva.Core`
- [ ] Encrypt `CommandJson` in `ApprovalCheckBehavior` + decrypt in `ApproveRequestCommandHandler`
- [ ] ✅ Checkpoint: build 0/0, existing 32 tests pass

### Tier 1: Person Registry — Backend (2-3 hours)
- [ ] Enums: `Gender`, `MaritalStatus`, `EmploymentType`, `EmploymentStatus`, `LeaveStatus`
- [ ] Entities: `Department`, `Designation`, `Employee` (with emergency contact fields), `EmployeeHistory`
- [ ] EF Configurations + indexes
- [ ] DbSets in `XorvaDbContext`
- [ ] Department CRUD (Command + Handler + Validator × 3, Query × 2)
- [ ] Designation CRUD (Command × 3, Query × 1)
- [ ] Employee CRUD (Create + Update + Status + Salary × 4 commands, List + Get + Me × 3 queries)
- [ ] Employee Code auto-generation with retry
- [ ] Approvable: `HR.CreateEmployee`, `HR.SalaryChange`, `HR.TerminateEmployee`
- [ ] FluentValidation: cross-company FK checks, self-report guard
- [ ] `HRModuleExtensions.cs` — DI + action registry
- [ ] Controllers: `DepartmentsController`, `DesignationsController`, `EmployeesController`
- [ ] Migration → apply to Neon
- [ ] Register in `Program.cs`: `builder.Services.AddHRModule()` + validator scan
- [ ] ✅ Checkpoint: build 0/0, new unit tests pass

### Tier 2: Leave Management — Backend (2-3 hours)
- [ ] Entities: `HolidayCalendar`, `Holiday`, `LeaveType`, `LeaveAllocation`, `LeaveRequest`
- [ ] EF Configurations + indexes
- [ ] Holiday CRUD (Create, List, Delete)
- [ ] LeaveType CRUD (Create, Update, Delete, List) + default seed
- [ ] ApplyLeave (with balance check + `pendingDays` reservation + overlap check)
- [ ] CancelLeave (release `pendingDays` or `usedDays`)
- [ ] GetMyLeaves, GetLeaveBalance, ListTeamLeaves queries
- [ ] Approvable: `HR.LeaveRequest`
- [ ] Auto-create LeaveAllocations when employee is created
- [ ] Controller: `HolidaysController`, `LeaveTypesController`, `LeavesController`
- [ ] Migration → apply to Neon
- [ ] ✅ Checkpoint: build 0/0, integration test: "leave → approve → balance updated"

### Tier 3: Frontend (2-3 hours)
- [ ] HR API client (`src/api/hr.api.ts`)
- [ ] Wire TanStack Query for all HR pages
- [ ] Departments page (table + create/edit modal)
- [ ] Designations page (table + create/edit modal)
- [ ] Employees list (rich table with filters)
- [ ] Employee create form (multi-section)
- [ ] Employee profile view
- [ ] Leave Types config page (admin)
- [ ] Apply Leave form
- [ ] My Leaves page + balance cards
- [ ] Nav updates (role-gated HR section)
- [ ] ✅ Checkpoint: `npm run build` passes, proxy E2E green

### Tier 4: Testing + Polish (1 hour)
- [ ] Unit tests: Department/Designation/Employee CRUD, cross-company reject, code race
- [ ] Integration tests: full approval loop with HR actions
- [ ] Swagger sweep: all endpoints return correct shapes
- [ ] Update `context/PROGRESS.md`
- [ ] ✅ DONE

---

## 7. Verdict

| Question | Answer |
|----------|--------|
| Are the docs complete enough to build? | ✅ **YES** — the two docs together cover everything |
| Are they professional / architect-level? | ✅ **YES** — entity design, separation of concerns, security, edge cases |
| Is anything critically missing? | ⚠️ Minor gaps (weekend rules, module activation guard) — not blockers |
| Can we build the full HR module today? | ✅ **YES** — ~8-10 hours of focused work following the tiered build order |
| Which doc should the builder follow? | **BOTH** — Spec for contracts, Build Plan for execution order |

> **Bottom line: Start coding now. The docs are ready. Follow the build order: Step 0 → Tier 1 → Tier 2 → Tier 3 → Tier 4.**
