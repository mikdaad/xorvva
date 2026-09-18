# Xorva ERP — Daily Log

## Day 1 — Tuesday, July 14, 2026
**Built:** Full .NET solution (8 projects), Xorva.Core, Xorva.Infrastructure, Auth module
(register/login/refresh/me/users), API host with middleware pipeline, InitialCreate migration
applied to Neon, manual SystemAdmin created via API, React frontend (login/register/dashboard
with antd at the time).
**Blocker at end of day:** frontend could not reach the backend — root cause found next morning:
Vite proxy targeted port 5000 while the API runs on 5270. The backend itself was working.

## Day 1 closure — Wednesday, July 15, 2026 (morning)
Full audit of every backend + frontend file, then fixes:

1. **FIXED (critical):** EF Core tenant query filter used `Expression.Constant(tenantService)` —
   would have frozen the first request's tenant into the cached model and silently broken
   isolation from Day 2 onward. Rewritten to the per-instance DbContext pattern.
2. **FIXED (critical):** `POST /api/auth/register` was anonymous and accepted any role —
   anyone could create a SystemAdmin. Now `[Authorize] + [RequireRole(CompanyAdmin)]`, and the
   handler forces callers' own tenant/company. Verified live: anonymous register → 401.
3. **FIXED (blocker):** Vite proxy 5000 → 5270. E2E through the proxy now passes.
4. **FIXED:** `npm run build` failed (TS6 rejects deprecated `baseUrl`). tsconfig cleaned.
5. **FIXED:** login/refresh failures now return 401 (new UnauthorizedException), not 404.
6. **ADDED:** DbInitializer — migrations + SystemAdmin seed at startup (password via user-secrets).
7. **ADDED:** unique index (Email, TenantId) is now NULLS NOT DISTINCT (new migration applied).
8. **SECURITY:** all secrets moved to user-secrets; JWT key rotated; appsettings.json has
   placeholders only. TODO for user: rotate the Neon DB password in the Neon console.
9. **REPLACED:** Ant Design + CSS Modules → Tailwind CSS v4 + in-house UI kit (user decision).
   Bundle: 296 KB (96 KB gzip). Register page became admin-only "Add User" page.
10. **TESTS:** 13 unit tests written (SQLite in-memory), all pass. Build: 0 errors / 0 warnings.
11. **VERIFIED E2E through Vite proxy:** login (401 bad / 200 good), /me, authenticated
    register 201, refresh rotation, reuse detection 403.
12. Repo initialized and pushed to GitHub (Amir-ibn-iliyas/xorvaerp).

**Time spent:** ~half day. **Next:** Day 2 — Tenants module + multi-tenancy proof.

## Day 2 — Wednesday, July 15, 2026 (afternoon)
**Design first, then code** (decisions recorded in ARCHITECTURE.md):
entity split TenantEntity/CompanyEntity; role-aware company filter; Company itself
tenant-scoped; public atomic signup with no tokens returned; email unique platform-wide;
modules as validated text[]; 404-not-403 for cross-tenant probes; least-privilege default role.

**Built:**
- Backend: Tenant/Company/Branch entities + ModuleCatalog; 3 query filters in DbContext;
  RegisterTenant (public, atomic), CreateCompany, UpdateCompanySettings, SetCompanyModules,
  CreateBranch; GetCurrentTenant, ListCompanies (role-scoped), ListBranches;
  RegisterUser now validates company membership; TenancyFoundation migration applied to Neon.
- Tests: 25 unit + 2 integration = **27/27 green**. Integration = real HTTP isolation proof
  (WebApplicationFactory + SQLite + appsettings.Testing.json): Tenant A ≠ Tenant B, direct-id
  attack → 404, duplicate email across tenants → 409.
- Frontend: /signup onboarding (auto-login), /companies (create/settings/modules),
  /branches (list/create), shared AppShell with role-gated nav. Build + proxy E2E green.

**Gotchas learned:**
- WebApplicationFactory + minimal hosting: factory-injected config loads BEFORE
  appsettings.json → use appsettings.Testing.json instead.
- SQLite enforces the new FKs → tests must seed Tenant roots (good — mirrors Neon).
- Fixed latent risk: CurrentTenantService.Role defaulted to enum 0 = SystemAdmin;
  now defaults to Employee.

**Demo tenant on Neon:** demo.ceo@xorva.local / DemoCeo@2026! ("Xorva Demo Group").
**Next:** Day 3 — Approval Engine (pipeline behavior + rule CRUD + inbox + history).

## Day 3 — Thursday, July 16, 2026 (Approval Engine)
**Design locked first** (5 enforcement + 5 config decisions in [[xorva-approval-engine-design]] / ARCHITECTURE.md).

**Built:**
- Core: IApprovableAction, action registry, replay execution context, approval entities (frozen steps, requester context, int concurrency token).
- ApprovalCheckBehavior (MediatR, after validation): interception → escalation + auto-skip → serialize → 202; all-skipped executes inline.
- Rule CRUD (dynamic registry dropdowns, duplicate-forbid, CEO Mandatory / CompanyAdmin read-only), Approve (replay under restored requester identity in fresh DI scope) / Reject / inbox / history.
- CreateBranch + RegisterUser made approvable; ApprovalEngine migration on Neon.
- Frontend: Rule Builder, Pending inbox, History, StepChain; 202 handled in create flows; role-gated nav.

**32/32 tests** (25 unit + 7 integration). Live Neon E2E: submit 202 → CEO approve → branch actually created → history recorded.

**Gotchas fixed (cross-provider — SQLite tests vs Neon):**
- PostgreSQL `xmin` concurrency token broke SQLite EnsureCreated → switched to a plain `int Version` + `IsConcurrencyToken()`, bumped per action.
- `int[]` array conversion for ApproverRoles is Npgsql-only → switched to comma-separated string.
- Deleting migration .cs files does NOT revert the model snapshot → must use `dotnet ef migrations remove`. Had to revert Neon → remove → regenerate twice.
- Approve/reject endpoints need a JSON body ([FromBody]) or 415 — frontend always sends one.

**Demo:** demo.admin@xorva.local / Admin@2026! (CompanyAdmin) added to the demo tenant; rule "Branch Approval" (CreateBranch needs CEO) active on company Demo IT Solutions.
**Next:** Day 4 — HR Module (Departments, Employees; HR.CreateEmployee plugs into the engine).

## Day 4 HR Module — built Saturday, July 18, 2026 (Day 4 skipped; done on Day 5)
Full HR module (Antigravity's HR_MODULE_SPECIFICATION.md + ERP-completeness additions), per
HR_MODULE_BUILD_PLAN.md. Entities OWNED BY THE HR MODULE via new IXorvaDbContext abstraction.

**Built (tiered, green build each checkpoint):**
- Step 0: IXorvaDbContext (Core) + IDataProtector encryption of ApprovalRequest.CommandJson (salary/password safe; closes Day-3 finding).
- Tier 1: Department, Designation, Employee (rich + emergency contact), EmployeeHistory. Full CRUD, EmployeeCode auto-gen+retry, cross-company FK validation, manager dept-scoping, salary visibility, approvals (CreateEmployee/SalaryChange/Terminate). Migration HRPersonRegistry.
- Tier 2: Holiday, LeaveType (+5 seed), LeaveAllocation (concurrency token), LeaveRequest. ApplyLeave (working-day calc, overlap, balance; approvable), Cancel, balance/my/team queries. Migration HRLeaveManagement.
- Frontend: hr.api.ts + Departments/Designations/Employees(list+filter+form)/LeaveTypes/MyLeave pages, role-gated nav.

**35/35 tests** (25 unit + 10 integration). HR integration: EMP-0001 registry, CreateEmployee triggers approval (202→approve→created w/ decrypted salary), leave apply 30→25 (Mon-Fri = 5 working days). Live + proxy E2E green.

**Decisions/notes:** HR entities in module (not Core) — precedent for Phase-2 migration of other modules. Salary in approval payload encrypted. CEO (no company) must pass companyId on HR creates; CompanyAdmin implicit. Leave over-draw prevented by execution-time balance re-check (not submit reservation). Employee's login user must have correct CompanyId or the tenant filter hides their own record.
**Next:** Day 5 polish — role dashboard, i18n, rate limiting, final E2E.

---

# PHASE 2 — Accounting module (July 25–26, 2026)

Built the full double-entry Accounting module (`Xorva.Modules.Accounting`, feature-foldered,
**Core-only** like HR). Standing rules honored throughout: pillars (Auth/Tenants/Approvals/HR/Core
+ folder conventions) untouched — Accounting only plugs in additively; commit + push to `main` after
every green stage; mirror HR conventions.

## July 25 — Ledger engine + foundation
**Built:** `IJournalPoster` (Core) + `JournalDraft`; `JournalPoster` engine (balance enforced in code,
period guard, number sequences); Chart-of-Accounts templates + `SeedChartOfAccounts` (also seeds
`AccountingSettings` posting map + tax); manual journals + void (reversal); fiscal years/periods;
Trial Balance. `SystemAccount` enum so any module posts to well-known accounts. 40 unit tests green.
**Notes:** Infrastructure references the Accounting module (HR pattern) so `XorvaDbContext` declares the
`DbSet<>`s and auto-discovers EF configs; Accounting references Core only.

## July 26 — Sales/Purchases, statements, Stage E, multi-currency, verification (the big day)
**Built (each stage: build 0/0 → tests green → commit → push):**
- **Sales/Purchases:** invoices + customer payments + credit notes; bills + supplier payments + debit
  notes; exact auto-journal recipes; document + journal commit atomically.
- **Statements:** P&L, Balance Sheet, Cash Flow, General Ledger, Aged AR/AP, VAT Return, finance
  dashboard — all computed from posted `JournalLine` rows.
- **Stage E:** E1 department-function access (`Department.Function`, `[RequireAccountingAccess]`,
  `/accounting/my-access`); E2 HR payroll → salary journal via `IJournalPoster`; E3 opening balances;
  E4 period/year-end close; E5 fixed assets + depreciation; E6 bank reconciliation; **E9** approval
  amount thresholds (`IAmountApprovableAction` async resolver; behavior branch: below threshold runs,
  else queues); **E8** e-invoicing UBL 2.1 / PINT AE export (+ seller tax identity); **E7**
  multi-currency (foreign docs post to base ledger at rate; realized FX gain/loss; then increment 2:
  auto-reversing **unrealized FX revaluation** + FX manual journals).
- **Cross-cutting verify (build-guide PART 4):** audit found the one gap — **multi-company
  consolidation** wasn't built. Built it: `AccountingGuard.ResolveReportScope` → null scope for a CEO
  omitting companyId; core reports aggregate tenant-wide + merge by account code; FE "All companies"
  toggle (`useReportScope`). Added `AccountingCycleTests` (full cycle, approval-gated posting, CEO
  consolidation across two companies). Added HR employee unit tests.

**Deploy to Neon (July 26):** discovered all 18 accounting migrations were **pending** on Neon (tests
use throwaway SQLite, so they never touched Neon). Applied them (`dotnet ef database update`) — 25
applied / 0 pending — and smoke-tested a live API boot against Neon (login 401/200 as expected).
Updated `docs/HOW_TO_RUN_AND_TEST.md` + `docs/Xorva_Test_Tracker.xlsx` + these context docs.

**Gotchas learned (Phase 2):**
- `using static` on AccountType/AccountSubType caused CS0229 ambiguity (Equity/Revenue) → alias with
  `using AT = ...; using AST = ...`.
- A local var named `from` collides with the LINQ `from` keyword (CS1525) → rename to `fromDate`.
- Base-currency path must stay byte-identical when adding multi-currency (rate == 1) — every FX effect
  is a new branch, so all prior tests stayed green.
- FX revaluation must post an **auto-reversing** entry (next day) or it double-counts the realized
  gain/loss booked at settlement.
- `dotnet ef` needs `ASPNETCORE_ENVIRONMENT=Development` to load user-secrets (Neon connection).
- Excel locks an open .xlsx — the tracker can't be written while it's open.

**State today:** Accounting Phase 2 complete + verified. 110 tests green; Neon live; frontend builds.
Only deferred accounting item: foreign-currency bank-account cash tracking.

---

## Sept 17–18, 2026 — TrueLedge → Xorva accounting port, Phase 2 (backend)

- **Phase 1 (mapping) approved:** Strategy A gap-fill; scope = everything (vouchers F4–F9, cost
  centres, bank CSV import + matching, register, master enrichment, PDF/XLSX export, Gemini inbox).
  User correction: TrueLedge is Postgres/Supabase RPC + RLS, **not** .NET — port the SQL as SQL.
- **SQL port** `Xorva.Infrastructure/Sql/Accounting/0001–0007` written and tested against an embedded
  Postgres 18 in the sandbox (`Sql/Tests/`, 155 assertions green). RPCs write Xorva's own journal
  tables; report RPCs read `Status IN ('Posted','Voided')` to match the C# reports' void-by-reversal.
- **.NET plumbing** written blind (no SDK in sandbox): session interceptor, RPC facade, Gemini
  extractor, configs, migration wrapper, five feature slices + controllers, `IPartyDirectory` port so
  Accounting never references Commerce, role-aware `PeriodGuard`, cost centres on manual journals,
  dependency-free PDF/XLSX writers, unit tests + `FakeAccountingRpc`.
- **Gotchas learned:**
  - Trigger row comparisons need `IS NOT DISTINCT FROM` (NULL columns); header-vs-line insert ordering
    guarded with `xmin = pg_current_xact_id()::xid`.
  - `RETURNS TABLE` plpgsql needs exact column types (`smallint`→`::int`, `sum(count(*))`→`::bigint`).
  - Don't guess baseline column names (Contacts has `TaxNumber`/`PaymentTermDays`) — dump the EF
    snapshot with `snapshot2sql.mjs`.
  - Hand-written EF migrations: don't hand-edit the snapshot; add an empty follow-up migration locally.
  - The sandbox wipes `/tmp` and processes between turns; the Postgres test bed is rebuilt from
    `npm pack @embedded-postgres/linux-x64` when missing.
- **State:** SQL green; .NET awaiting the user's local `dotnet build/test/ef` (steps in PROGRESS.md).
  Next: fix build feedback → Phase 3 UI after check-in.

**Sept 18 (cont.) — local verification + Supabase.** Build/test round-trips with the user fixed:
`var from` vs LINQ query keyword (again — see gotcha above), `[Migration]` attribute duplicated between
migration and Designer, and a real bug: when re-posting a tracked Draft, new `VoucherLine`s reached the
context only via the navigation and (Guid keys pre-generated by `BaseEntity`) were attached as
*Modified* → `DbUpdateConcurrencyException`; fixed with an explicit `Set<VoucherLine>().Add` (and no
double-append after EF fix-up). Test fake now replays the RPC's status side-effects. 166/166 green.
EF read-model catch-up migration generated by the user, emptied, verified with the new
`verify_readmodel.mjs`, applied to **Supabase** (the target DB is now Supabase, not Neon). Phase 3 (UI) started.

**Sept 18 (cont.) — Phase 3 UI written.** Ported TrueLedge's `(platform)` screens into the Vite SPA
using Xorva's own primitives (no shadcn): `ledger.api.ts` client, `SearchSelect` combobox,
`VoucherEntryPage` (F4–F9 / Ctrl+A / Enter-to-next-cell, Dr-Cr vs invoice grids, cost centres, draft
edit, inbox prefill), `VoucherRegisterPage`, `CostCentresPage`, `BankImportPage`, `DocumentInboxPage`,
graded period close on `FiscalYearsPage`, PDF/XLSX buttons on TB / BS / GL, quick actions on the
accounting overview, routes + nav. Everything is written blind (no `npm install` in the sandbox) with
a light static check for unused imports/state; the user runs `npm run build` next. Design choices:
new client file rather than growing `accounting.api.ts`; enums as string unions; blob downloads via the
axios client so the JWT rides along; inbox→voucher via router state and auto-link on post.

