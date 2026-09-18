# Xorva ERP — Progress (Phase 1 + Phase 2)

**Phase 1 deadline:** Saturday, July 18, 2026 — ✅ met.
**Last updated:** Sunday, July 26, 2026 — **Phase 2 (Accounting) COMPLETE + verified.**
**Current status:** 110 automated tests green (97 unit + 13 integration); frontend builds clean;
**Neon fully migrated** (25 migrations, 0 pending). Phase-2 detail is in the "Phase 2" section below;
Phase-1 history is preserved unchanged underneath it.

## Day 1 — Auth Module ✅ COMPLETE (closed out July 15)

### Backend
- [x] Modular Monolith solution — 8 projects, builds **0 errors / 0 warnings**
- [x] Xorva.Core: base entities, SystemRole enum, exceptions (incl. UnauthorizedException → 401), ApiResponse, PagedResult
- [x] Xorva.Infrastructure: XorvaDbContext (per-instance tenant query filter), JwtTokenService, PasswordHasher (BCrypt 12), CurrentTenantService, DbInitializer (migrate + seed at startup)
- [x] Auth module: RegisterUser, LoginUser, RefreshToken commands + GetCurrentUser, GetUsersByRole queries (MediatR + FluentValidation)
- [x] RBAC: RequireRoleAttribute, 5-level hierarchy, register locked to CompanyAdmin+
- [x] Middleware pipeline: Exception → Logging → CORS → AuthN → TenantResolver → AuthZ → Controllers
- [x] Secrets in user-secrets (dev); appsettings.json has placeholders only

### Database (Neon PostgreSQL)
- [x] Migrations: `InitialCreate`, `UsersEmailUniqueNullsNotDistinct` — both applied
- [x] Tables: Users, RefreshTokens
- [x] SystemAdmin exists (admin@xorva.com); DbInitializer seeds if missing (password via user-secrets `SeedSettings:SystemAdminPassword`)

### Frontend (React 19 + Vite 8 + TypeScript + **Tailwind CSS v4** — antd removed July 15)
- [x] Xorva dark theme as Tailwind `@theme` tokens (official brand palette)
- [x] Own UI kit: Button, Field, SelectField, Alert, Card, Spinner, Logo (`src/components/ui.tsx`)
- [x] Login page; Add User page (admin-only, role dropdown limited by hierarchy); Dashboard
- [x] AuthContext + axios interceptor (silent refresh; skips auth endpoints) + Protected/Guest routes
- [x] Vite proxy → API port 5270 (was the Day-1 blocker: pointed at 5000)
- [x] `npm run build` passes (tsc + vite), bundle 296 KB / 96 KB gzip

### Testing
- [x] 13 unit tests (Register/Login/Refresh handlers, SQLite in-memory) — all pass
- [x] E2E verified through Vite proxy: login 401/200, /me, authenticated register 201, anonymous register 401, refresh rotation, reuse detection 403
- [ ] Integration tests (WebApplicationFactory) — deferred to Day 2+

## Day 2 — Tenants + Multi-Tenancy ✅ COMPLETE (July 15)

### Backend
- [x] Entity hierarchy split: `TenantEntity` (TenantId) / `CompanyEntity` (adds CompanyId) — Company itself is tenant-scoped
- [x] Tenant, Company, Branch entities (in Core, same documented tradeoff as ApplicationUser) + ModuleCatalog constants
- [x] Global query filters: Tenant root (Id == current), tenant-scoped, and role-aware company-scoped (SuperAdmin sees all companies; others confined to own CompanyId)
- [x] `POST /api/tenants/register` — PUBLIC SaaS signup: Tenant + first Company + SuperAdmin in ONE transaction
- [x] CreateCompany / UpdateCompanySettings / SetCompanyModules (SuperAdmin) / CreateBranch commands
- [x] GetCurrentTenant / ListCompanies (role-scoped) / ListBranches queries
- [x] Module activation per company (text[] column, validated against ModuleCatalog)
- [x] Email now unique PLATFORM-WIDE (login resolves by email alone); RegisterUser validates company membership
- [x] CurrentTenantService default role = Employee (least privilege), HasCrossCompanyAccess
- [x] Migration `TenancyFoundation` applied to Neon; build 0 errors / 0 warnings

### Testing — 27/27 pass
- [x] 25 unit tests (13 auth + 12 tenants: signup atomicity, role scoping, filter confinement, FK integrity)
- [x] 2 INTEGRATION tests over real HTTP (WebApplicationFactory + SQLite, appsettings.Testing.json):
      **Tenant A ≠ Tenant B isolation proof** (lists disjoint; direct id attack → 404 not 403) + platform-wide email uniqueness

### Frontend
- [x] `/signup` — public onboarding (org + company + CEO account → auto-login)
- [x] `/companies` — list, create (SuperAdmin), settings modal, module activation picker
- [x] `/branches` — list with empty state, create modal (CompanyAdmin+)
- [x] Shared `AppShell` (header + role-gated nav) adopted by all authenticated pages
- [x] Login page links to signup; `npm run build` passes; proxy E2E green

### Live E2E on Neon (verified via curl)
Signup 201 → login → tenant/current → companies (defaults AED/Asia/Dubai/[HR]) → second company 201 →
branch 201 → settings 200 → modules set → invalid module 400 with catalog message

## Day 3 — Approval Engine ✅ COMPLETE (July 16)

### Backend
- [x] Core contracts: IApprovableAction (ActionKey + summary + target company), ApprovableActionDescriptor, IApprovableActionRegistry, IApprovalExecutionContext (replay flag)
- [x] Entities: ApprovalRule, ApprovalRequest (frozen steps + requester context + int Version concurrency token), ApprovalRequestStep (CompanyEntity), ApprovalRuleAudit
- [x] ApprovalCheckBehavior — MediatR pipeline behavior AFTER validation: intercept → escalation + auto-skip → serialize → 202 pending; all-skipped → execute inline
- [x] Rule CRUD (dynamic registry, duplicate-forbid, CEO Mandatory / CompanyAdmin read-only)
- [x] Approve (replay in fresh DI scope under restored requester identity) / Reject / Pending inbox / History
- [x] APPROVED_BUT_FAILED terminal state; optimistic concurrency (Version++) on approve/reject
- [x] CreateBranch + RegisterUser made approvable; descriptors registered by their modules
- [x] ApprovalStatusResultFilter promotes pending responses to HTTP 202
- [x] Migration `ApprovalEngine` applied to Neon; build 0/0

### Testing — 32/32 pass (25 unit + 7 integration)
- [x] Integration (real HTTP + SQLite): full loop (submit 202 → inbox → approve → **branch actually created**), reject terminates, auto-skip executes inline, duplicate rule 409, **APPROVED_BUT_FAILED** recorded not lost

### Frontend
- [x] approvals.api.ts; Rule Builder (dynamic Module→Action dropdowns, ordered approver steps, Mandatory for CEO)
- [x] Pending inbox (approve/reject with comment, StepChain visual), History (audit trail with status + outcome)
- [x] 202-pending handled in branch + user creation ("Submitted for approval")
- [x] Nav: Approvals / Rules / History (role-gated); build passes; proxy E2E green

### Live E2E on Neon (curl)
Registry → create CompanyAdmin → create rule (CreateBranch needs CEO) → CompanyAdmin submit **202** → CEO inbox canAct → approve → **Approved, branch exists** → history recorded

## Day 4 — HR Module ✅ COMPLETE (built July 18)

Full HR module per HR_MODULE_SPECIFICATION.md + build plan, entities OWNED BY THE HR MODULE
(via new `IXorvaDbContext` abstraction in Core — HR references only Core+MediatR+FluentValidation).

### Step 0 (foundations)
- [x] `IXorvaDbContext` in Core (module-owned entities, no circular dep, zero Day1-3 rework)
- [x] `CommandJson` encrypted at rest with `IDataProtector` (protects salary + password; closes Day-3 finding)

### Tier 1 — person registry
- [x] Department (hierarchy, head), Designation (levels), Employee (rich profile + emergency contact), EmployeeHistory (salary/status audit)
- [x] Department CRUD, Designation CRUD, Employee CRUD (create/update/status/salary + list paged/filtered + get + /me)
- [x] EmployeeCode auto-gen (EMP-0001) with retry; cross-company FK validation; manager dept-scoping; salary visibility
- [x] Approvable: HR.CreateEmployee, HR.SalaryChange, HR.TerminateEmployee
- [x] Migration `HRPersonRegistry` on Neon

### Tier 2 — leave management
- [x] Holiday, LeaveType (+ 5 default seed), LeaveAllocation (balance + concurrency token), LeaveRequest
- [x] ApplyLeave (working-day calc excl. weekends+holidays, overlap check, balance check; approvable HR.LeaveRequest), CancelLeave (returns days), balance/my-leaves/team-leaves queries, Holiday + LeaveType CRUD
- [x] Migration `HRLeaveManagement` on Neon

### Frontend
- [x] hr.api.ts; Departments, Designations, Employees (list+filter+paged+create form), Leave Types (+seed), My Leave (balance cards+apply+cancel)
- [x] Role-gated HR nav; build passes; proxy E2E green

### Testing — 35/35 (25 unit + 10 integration)
- [x] HR integration: person registry (EMP-0001), **CreateEmployee triggers approval** (202→approve→created w/ decrypted salary), leave apply consumes balance (30→25, weekends excluded)

### Deferred to Phase 2 (need infra)
Attendance (shift/biometric engine), Document upload (Cloudinary), Payroll, Loans, Gratuity, salary/leave via TanStack Query refactor, leave pendingDays reservation (correctness already via replay re-validation).

## Day 5 (Sat) — UI, Navigation, Onboarding, Dashboards ✅ (experience layer built)

Built per docs/DAY5_FINAL_PLAN.md (merged Claude + Antigravity docs).

### Backend
- [x] `Tenant.OnboardedAt` (+ migration `TenantOnboarding`); `POST /api/tenants/complete-onboarding` (CEO)
- [x] `GET /api/dashboard` — role-shaped summary (DashboardService, one round-trip); `GET /api/admin/overview` (SystemAdmin, cross-tenant)
- [x] Build 0/0; **35/35 tests still green** (no new tests yet — deferred to pre-demo)

### Frontend
- [x] **App shell redesign**: left `Sidebar` (grouped, role + module-aware) + `Header` (company switcher, notifications bell w/ pending badge, user menu); wider `max-w-7xl` layout
- [x] **CompanyContext**: active-company switcher for CEO (sends companyId on HR/company writes); all HR pages use it
- [x] **Role dashboards**: one `DashboardPage` — CEO (companies/headcount/approvals + headcount BarList + getting-started), CompanyAdmin (headcount/depts/on-leave + recent hires), Manager (team/inbox), Employee (leave balance + profile), SystemAdmin (platform tiles + signups). `StatTile`/`SectionCard`/`BarList` components (dataviz method)
- [x] **Onboarding**: first-login `OnboardingGate` routes un-onboarded CEO to `/onboarding` — dynamic skippable wizard (confirm companies + pick modules per company + add-another loop) → complete-onboarding
- [x] **Landing page** (`/`): brand hero + feature cards + Get Started/Sign In
- [x] **Employee profile page** (`/hr/employees/:id`): sections + salary/status change (approvable)
- [x] **Holidays page**; module-aware nav; states audit
- [x] `npm run build` passes; proxy E2E green (landing, dashboards, onboarding state)

### Remaining (pre-demo, tomorrow)
- [ ] Full automated test pass + new dashboard/onboarding tests
- [ ] Manual browser walkthrough (the demo script) before showing the lead
- [ ] Optional: i18n wiring, rate limiting (Phase-2 items)

---

# PHASE 2 — Accounting module ✅ COMPLETE + VERIFIED (July 25–26, 2026)

A full double-entry accounting module (`Xorva.Modules.Accounting`), feature-foldered, referencing
**Core only** (same clean pattern as HR: `IXorvaDbContext` + `IJournalPoster`). Everything plugs into
the existing pillars (Auth, Tenants, Approvals, HR) additively — no pillar behavior changed.
Committed directly to `main` and pushed after every green stage.

### Engine + foundation (Stage A)
- [x] `JournalPoster` implements Core `IJournalPoster` — the double-entry engine (Σdebit=Σcredit
      enforced, period guard, number sequences, updates cached balances; every document posts through it)
- [x] Chart-of-Accounts templates (General/Trading/Construction/Staffing/Software), `AccountingSettings`
      posting map + tax seeded on activation, fiscal years/periods, manual journals + void (reversal)
- [x] `SystemAccount` enum resolved per-company (lets HR payroll post salary journals w/o referencing Accounting)

### Documents + statements (Stages B–D)
- [x] **Sales:** invoices (draft → post → auto-journal DR AR / CR Sales / CR VAT), customer payments +
      allocation, credit notes. **Purchases:** bills (DR Expense / DR VAT-Input / CR Payable), supplier
      payments, debit notes.
- [x] **Statements** (computed from posted lines, never a cached field): Trial Balance, P&L, Balance
      Sheet, Cash Flow, General Ledger, Aged AR/AP, VAT Return, finance dashboard.

### Completeness (Stage E — E1–E9, all shipped)
- [x] **E1** department-function access model (`Department.Function`; a Manager heading an
      Accounting-function dept = the accountant); `[RequireAccountingAccess]` + `/accounting/my-access`
- [x] **E2** HR payroll pay-runs → salary journal via `IJournalPoster` · **E3** opening balances ·
      **E4** period/year-end close (P&L → Retained Earnings) · **E5** fixed assets + depreciation ·
      **E6** bank reconciliation
- [x] **E7** multi-currency: foreign invoices/bills post to the base-currency ledger at the document's
      rate; realized FX gain/loss on settlement; **increment 2:** period-end **unrealized FX
      revaluation** (auto-reversing) + multi-currency manual journals
- [x] **E8** e-invoicing export — **UBL 2.1 / PINT AE** XML for posted invoices (+ seller tax-identity settings)
- [x] **E9** approval **amount thresholds** on money actions (invoice ≥ X → route for approval)

### Cross-cutting verification (build-guide PART 4)
- [x] **Multi-company consolidation** (was the one gap; now built): a CEO who omits `companyId` gets a
      tenant-wide report. `AccountingGuard.ResolveReportScope` → null scope; P&L / Balance Sheet /
      Trial Balance / dashboard aggregate and merge by account code; FE "All companies" toggle.
- [x] Approvals-on-posting proven end-to-end (202 → approve → journal); tenant isolation proven for
      accounting; full accounting cycle proven over HTTP (`AccountingCycleTests`).
- [x] **HR employee unit tests** added (create/update/list + salary-visibility rule).

### Money actions that are approvable (register under module "Accounting")
`Accounting.PostInvoice`, `.PostBill`, `.RecordPayment`, `.RecordSupplierPayment`, `.ManualJournal`,
`.RunPayroll` — all support an optional amount threshold.

### Database (Neon) — applied July 26
All 18 accounting/payroll migrations (`AccountingLedger` … `FxRevaluation`) applied to Neon;
`dotnet ef migrations list` = 25 applied, 0 pending. Live API boot against Neon smoke-tested (login OK).

### Tests — 110 green (97 unit + 13 integration)
Unit: engine (balanced/unbalanced/void/closed-period), invoice/bill recipes, payments (full/partial/
over-alloc), credit/debit notes, statements, fiscal close, opening balances, depreciation, bank
reconciliation, payroll, approvable actions, amount thresholds, e-invoice export, multi-currency + FX
revaluation, accounting access, HR employee handlers. Integration: full accounting cycle, approval-
gated posting, CEO consolidation across two companies (+ existing tenant/HR/approval suites).

### Reference docs
`docs/ACCOUNTING_BUILD_GUIDE.md` (the plan + "§11 Verification status — DONE"),
`docs/HOW_TO_RUN_AND_TEST.md` (run + test walkthrough), `docs/Xorva_Test_Tracker.xlsx` (coverage grid).

### Phase-2 deferred (only remaining accounting item)
Foreign-currency **bank-account cash tracking** (per-currency GL + bank revaluation) — a deliberate
boundary: with no foreign bank exposure yet, the AR/AP revaluation above is complete and correct.

---

# TRUELEDGE PORT — Phase 2b backend (Sept 17–18, 2026) ✅ BUILD + 166 TESTS GREEN, MIGRATED TO SUPABASE

Gap-fill port of the standalone **TrueLedge** app (Next.js + Supabase) into the accounting module.
Strategy A (approved): keep Xorva's `JournalPoster`, entities, approvals and tests; add TrueLedge's
missing capabilities additively. TrueLedge's Postgres/RPC/RLS layer is ported **as SQL**
(`Xorva.Infrastructure/Sql/Accounting/000{1..7}_*.sql` — source of truth), applied by a thin EF
migration wrapper; RPCs write into Xorva's existing `JournalEntries`/`JournalLines` (one ledger).

### SQL layer — DONE, 155 tests green against real Postgres 18
- `0001` schemas `app`/`accounting`, session context (`app.set_session_context`, `app.current_*`),
  `app.install_company_rls(regclass)` · `0002` RLS on every accounting table · `0003` vouchers
  (`Vouchers`, `VoucherLines`, `VoucherSequences`; `generate_voucher_number`, `post_voucher_atomic`,
  `reverse_voucher`, immutability + balance triggers) + cost centres (`CostCentreDimensions`,
  `CostCentres`, `JournalLines.CostCentreId`, hierarchy/level/leaf triggers) · `0004` bank statement
  import (`BankStatements`, `BankStatementLines`, `BankMatchRules`; `import_bank_statement`,
  `suggest_bank_matches`, confirm/unmatch/ignore) · `0005` master enrichment (Arabic names, FTA
  fields, control accounts, item purchase side, soft/hard period close `FiscalPeriods.CloseStatus`,
  `assert_period_open`, `set_period_close_status`) · `0006` AI document inbox (`AccountingDocumentFiles`,
  `AccountingDocuments`, `DocumentExtractions`, `DocumentFieldSuggestions` + upload/begin/complete/fail/
  override/accept/reject RPCs) · `0007` report RPCs (`get_balance_sheet`, `get_ledger_statement`,
  `get_transaction_register`, `get_trial_balance`, `get_cost_centre_report`,
  `get_bank_reconciliation_summary`) — JSONB shapes identical to TrueLedge `reports/types.ts`.
- Harness: `Sql/Tests/run.mjs` (Node + pg; regenerates the EF baseline from the model snapshot via
  `snapshot2sql.mjs`, applies 0001–0007, runs `test_000N_*.mjs`). Run instructions in `Sql/Tests/`.

### .NET plumbing — WRITTEN (uncompiled here; sandbox has no .NET SDK)
- Infrastructure: `SqlScript` (embedded `.sql` runner), `TenantSessionInterceptor` (sets the Postgres
  session context per connection so RLS/RPC see user/tenant/company/role), `AccountingRpc`
  (`IAccountingRpc` over Npgsql, same connection as EF), `GeminiDocumentExtractor`
  (`IDocumentExtractor`; gemini-2.5-flash, response schema, 12-rule prompt, masters context),
  EF configurations for all ported tables/columns, migration `20260917120000_AccountingSqlPort`
  (+ Designer) that runs 0001–0007.
- Accounting module slices: **Vouchers** (F4–F9 `VoucherEngine` + `VoucherTypes`, SaveAndPost /
  Reverse / Cancel, Get / List / Types), **CostCentres** (dimensions + centres CRUD, report; manual
  journal lines accept `CostCentreId`, `JournalPoster` validates leaf/active), **Banking import**
  (`BankCsvParser` port for ENBD/ADCB/FAB/Mashreq/RAK/DIB, preview/import/suggest/confirm/unmatch/
  ignore, match rules), **Documents** (upload → Gemini extract → review/override → accept-as-voucher /
  reject), **LedgerReports** (RPC reports + **PDF/XLSX export** via dependency-free `PdfWriter` /
  `XlsxWriter` over a renderer-neutral `ReportTable`), soft/hard **period close**
  (`SetFiscalPeriodClosedCommand.CloseStatus`; `PeriodGuard` is role-aware).
- Module boundary kept: Accounting reads Contacts/Products through the new `IPartyDirectory` port;
  Commerce registers the adapter (`PartyDirectory`) — mirror image of `IJournalPoster`.
- Controllers: `/api/accounting/vouchers`, `/cost-centres`, `/bank-statements`, `/documents`,
  `/ledger-reports` (+ `/export`). Existing endpoints untouched.
- Approvable action added: `Accounting.PostVoucher` (amount = base grand total).

### Tests written (run locally): `Tests/Xorva.Tests.Unit/Accounting/`
`VoucherEngineTests` (pure F4–F9 maths, FX rounding), `BankCsvParserTests`, `ReportExportTests`
(XLSX package validity, PDF xref/pagination, builders), `VoucherEntryHandlerTests` (SQLite +
`FakeAccountingRpc`: draft/post/repost, compensation on post failure, hard/soft close by role),
`CostCentreHandlerTests`. Fake RPC lives in `TestHelpers/FakeAccountingRpc.cs`.

### Local verification (Sept 18) — done
- `dotnet build` green after 3 fixes (LINQ `from` keyword collision, duplicate `[Migration]` attribute,
  voucher re-post attaching new lines as Modified). `dotnet test`: **166/166**.
- EF catch-up: `20260918054345_AccountingReadModel` (empty Up/Down) registers the read-model; verified
  against the SQL DDL with `Sql/Tests/verify_readmodel.mjs` (no real disagreements). Applied to
  **Supabase** together with `AccountingSqlPort` (target DB moved from Neon to Supabase; use the
  session pooler, port 5432).
- `Gemini:ApiKey` user-secret enables the inbox (extractor reports `IsConfigured=false` otherwise).

### Phase 3 (UI) — ✅ `tsc` + `vite build` green in the sandbox (Sept 18). Phase 4 (wiring + E2E) — not started.

**UI redesign v2 — technical minimalist (Sept 18, later):** graphite + signal-blue, glass `.panel`
surfaces over an engineered backdrop, `.btn-3d` / `.btn-3d-soft` physical controls, `Tilt`
(pointer-tracking ≤5° tilt + glare) on module cards / quick actions / stat tiles, Inter + Space
Grotesk + JetBrains Mono. Same token names, so the codemod touched 52 pages mechanically. `tsc` +
`vite build` green; all routes render in the jsdom harness; Tilt math verified (move → ±max°, leave → 0°).

**UI upgrade (Sept 18, same day):** full visual refresh to a quiet, minimalist violet system —
see ARCHITECTURE.md → Frontend conventions. New tokens (`border-strong`, `brand-weak`, `--c-*-weak`,
soft shadows), rewritten `ui.tsx` (same exports; `Button size`, `Field hint`, Modal Esc/scroll-lock/
bottom-sheet), `dashboard-ui.tsx` (quieter tiles, dotted `Pill`), new shell (248 px sidebar, 56 px
header with breadcrumb + inbox bell, ⌘K `CommandPalette`), split-panel login, codemod across 59 pages
(title scale, `bg-brand-weak`, `rounded-xl` cards, semantic tints, hairline borders). Verified with a
jsdom render of every route against `vite.mock.config.ts` (0 runtime errors; palette navigates; theme
toggle persists).

Delivered (network was available this turn: `npm ci`, `tsc --noEmit`, `vite build` all pass):
- `src/api/ledger.api.ts` — typed client for the Phase 2b surface (vouchers, cost centres, bank
  statements, document inbox, SQL ledger reports, `exportReport` blob download, graded period close,
  products). Kept separate from `accounting.api.ts` on purpose; `FiscalPeriod` gained `closeStatus`.
- `components/accounting/SearchSelect.tsx` — keyboard-first combobox (type-to-filter, ↑/↓, Enter picks;
  Enter on a closed picker bubbles to the grid). `components/accounting/ExportButtons.tsx` — PDF/Excel pair.
- Pages under `pages/accounting/`: `VoucherEntryPage` (F4–F9 switcher, Ctrl+A post, Enter = next cell,
  settlement/journal Dr-Cr grid vs invoice item grid, cost-centre column when centres exist, mandatory
  dimension check, live totals mirroring `VoucherEngine`, save draft / save & post, edit-draft route,
  inbox prefill via router state + auto-link on post), `VoucherRegisterPage` (filters, paging, detail
  modal, reverse w/ reason, cancel draft, PDF/XLSX export), `CostCentresPage` (dimension list + tree +
  spend report tab), `BankImportPage` (statement list w/ reconciliation bar, CSV upload → server preview
  → import, line matching with candidates / suggest / ignore / unmatch, rules CRUD),
  `DocumentInboxPage` (status tabs + counts, drag-drop upload, PDF/image preview, header + totals field
  override, line items, accept → link voucher / create voucher from extraction, reject, 3 s polling while
  Processing).
- Existing pages touched: `FiscalYearsPage` (Open → Soft → Hard cycle), `TrialBalance` / `BalanceSheet` /
  `GeneralLedger` (export buttons), `AccountingHomePage` (quick-action strip).
- Routing: `/accounting/vouchers`, `/vouchers/new`, `/vouchers/:id/edit`, `/cost-centres`,
  `/bank-statements`, `/inbox` in `App.tsx`; nav items in `navConfig.ts` (ADMINS, `accounting` group).

Phase 4 checklist (after the build is green): smoke each screen against Supabase, post one voucher of
every type and confirm `JournalEntries` rows + trial balance, import a real bank CSV, exercise the inbox
with `Gemini:ApiKey` set, verify approvals interception (`pendingApproval`) on post/reverse, verify
period-close guard messages, then update API_CONTRACTS/DAILY_LOG.

---

## Known deferred items (Phase 1)
- TanStack Query installed but not wired (adopt when list pages arrive)
- i18next installed but not initialized (Day 5)
- Logout does not revoke refresh token server-side (add /auth/logout later)
- Rotate the Neon DB password from the Neon console (old one was in committed-adjacent docs/chats)
