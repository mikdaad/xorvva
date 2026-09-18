# Xorva ERP — Architecture Decisions

## Solution layout (backend/, .NET 10 Modular Monolith)

```
Xorva.API            → host: controllers, middleware, Program.cs (references everything)
Xorva.Infrastructure → XorvaDbContext, migrations, JWT/BCrypt/tenant services (references Core)
Xorva.Core           → shared kernel: base entities, enums, interfaces, exceptions, ApiResponse
Modules/
  Xorva.Modules.Auth     → commands/queries/DTOs for auth (references Core + Infrastructure*)
  Xorva.Modules.Tenants  → empty shell (Day 2)
  Xorva.Modules.HR       → empty shell (Day 4)
Tests/
  Xorva.Tests.Unit        → 13 handler tests, SQLite in-memory
  Xorva.Tests.Integration → empty shell
```

## Conscious deviations from the master plan (decided July 15)

1. **Modules reference Infrastructure** (*). The plan said modules → Core only.
   Handlers use `XorvaDbContext` directly; an `IXorvaDbContext` abstraction in Core was
   deliberately skipped for Phase-1 velocity. Revisit in Phase 2 if module extraction becomes real.
   Rule that still holds: **modules never reference each other.**
2. **ApplicationUser + RefreshToken live in Xorva.Core**, not the Auth module —
   consequence of #1 (the DbContext needs the types). Same Phase-2 revisit.
3. **Frontend has no Ant Design and no CSS Modules** — pure Tailwind CSS v4 with a small
   in-house UI kit (`src/components/ui.tsx`). Decided July 15; antd was removed.
4. Login/refresh failures return **401** (UnauthorizedException), not 404.

## Multi-tenancy (critical pattern — extended Day 2)

Entity hierarchy (Day 2 restructure — BEFORE any business entity existed, so it was free):

```
BaseEntity → AuditableEntity → TenantEntity  (TenantId)   ← tenant-scoped (e.g. Company)
                                  └── CompanyEntity (adds CompanyId) ← company-scoped (Branch, HR, …)
Tenant (root) → AuditableEntity — its own filter: Id == currentTenantId
```

Global query filters in `XorvaDbContext` (all reference the context instance — NEVER
`Expression.Constant(service)`; EF caches the model once and would freeze the first
request's tenant forever — bug found & fixed July 15):
- Tenant root:    `t.Id == _tenantService.TenantId`
- TenantEntity:   `e.TenantId == _tenantService.TenantId`
- CompanyEntity:  `e.TenantId == current && (HasCrossCompanyAccess || e.CompanyId == current)`

**The architecture line:** tenant isolation is a SECURITY boundary → lives in the filter,
invariant. Company visibility is an AUTHORIZATION scope → role-aware: SuperAdmin/SystemAdmin
(`HasCrossCompanyAccess`) see all companies in scope; CompanyAdmin/Manager/Employee are
confined to their own CompanyId at the ORM level. Company rows themselves are tenant-scoped
(a Company IS the company), so ListCompanies narrows per-role in the handler.

Cross-tenant probes must return **404, never 403** — a 403 leaks that the id exists.
The filters make foreign rows invisible, so this falls out naturally; keep it that way.

`ApplicationUser` intentionally does NOT extend `TenantEntity` (login is pre-tenant;
SystemAdmin has null TenantId). Handlers use `IgnoreQueryFilters()` deliberately and only
where noted. `CurrentTenantService.Role` defaults to **Employee** (least privilege), never
SystemAdmin (enum 0) — an unauthenticated request must not carry an elevated default.

## Tenancy model decisions (Day 2)
- **Public SaaS signup** (`POST /api/tenants/register`): Tenant + first Company + SuperAdmin
  created in ONE SaveChanges = one DB transaction. No partial signups. Returns NO tokens —
  frontend chains a normal login (keeps Tenants and Auth modules decoupled).
- **Email is unique platform-wide** (index `IX_Users_Email`): login resolves by email alone,
  so per-tenant emails would make login ambiguous. One email = one account.
- **Module activation per company**: `Company.ActiveModules` as PostgreSQL `text[]`,
  validated against `Xorva.Core.Constants.ModuleCatalog`. SuperAdmin-only (subscription-level).
  Distinct from the Day-3 Approval Engine action registry.
- FKs: Company→Tenant and Branch→Company are `Restrict` — deleting a tenant/company is an
  explicit offboarding process, never a cascade.

## Approval Engine (Day 3)

Two layers. **Configuration** (admins build rules at runtime) and **Enforcement** (engine intercepts/queues/replays). Contracts live in `Xorva.Core.Approvals`; the engine's own screens live in `Xorva.Modules.Approvals` (references Core + Infrastructure, same tradeoff as other modules). Modules never reference Approvals and vice versa — they share only Core contracts.

**Dynamic registry:** each business module registers `ApprovableActionDescriptor`s in DI (`services.AddSingleton(descriptor)`); the singleton `ApprovableActionRegistry` collects them. A command is approvable when it implements `IApprovableAction` (stable `ActionKey`, summary, target `ApprovalCompanyId`). New modules appear in the rule-builder dropdowns with zero engine change. Descriptors carry `RequiresModuleActivation` — foundation actions (Organization/Users) always available; business-module actions gated by `Company.ActiveModules`.

**Interception** (`ApprovalCheckBehavior`, in the API pipeline AFTER `ValidationBehavior`): only valid + approvable commands, never during replay (`IApprovalExecutionContext.IsReplaying`). Finds the active rule for (target company, action key); none → execute normally. Builds the frozen step chain with **escalation** (missing role → next level up, ceiling SuperAdmin) and **auto-skip** (requester rank ≥ step → Skipped). All-skipped → execute inline. Else serialize the command (System.Text.Json), store `ApprovalRequest`, return `ApiResponse<T>.Pending(...)` → promoted to HTTP 202 by `ApprovalStatusResultFilter`.

**Deferred execution / replay** (on final approval, `ApproveRequestCommandHandler`): step-approval saved FIRST with `Version++` concurrency token (rejects the double-approve race); only the winner executes. Replay runs in a FRESH DI scope with `ICurrentTenantService` set to the **requester's** captured context (never the approver's — else tenancy corruption) and `IApprovalExecutionContext` in replay mode (no re-interception). Command type resolved from the registry via ActionKey (never assembly-qualified names — Phase-2 refactor safety). Success → `Approved`; any throw → **`ApprovedButFailed`** with the reason (never silent loss). Request stays `Pending` until execution completes.

**Never regress these seven:** replay under approver identity; missing optimistic concurrency; approval before validation; no ApprovedButFailed state; live-rule reads instead of the submit-time frozen snapshot; no self-approval block (`requester != approver` enforced, plus auto-skip); assembly-qualified type names.

**Concurrency token:** `ApprovalRequest.Version` is a plain `int` marked `IsConcurrencyToken()`, bumped on each action — provider-agnostic (works on Neon AND the SQLite test DB; the PostgreSQL `xmin` approach broke SQLite). Similarly `ApprovalRule.ApproverRoles` is stored as a comma-separated string, not an `int[]` array (arrays are Npgsql-only).

**Config decisions (locked):** self-approval auto-skips; missing approver escalates up; duplicate active rule per (company, action) forbidden at creation; one rule = one company; CEO Mandatory rules are read-only to CompanyAdmin.

## HR Module — module-owned entities (Day 4)

**HR entities live in the HR module**, not Core — the first module to own its entities.
Enabled by `IXorvaDbContext` (Core): a thin interface exposing generic `Set<T>()` +
`SaveChangesAsync()`. HR entities are POCOs in `Modules/Xorva.Modules.HR/Entities/` extending
`CompanyEntity`; the HR module references **only Core + MediatR + FluentValidation** (no
Infrastructure, no EF). The concrete `XorvaDbContext` (Infrastructure) references the HR module
to register entities + their EF configs. Dependency graph: `HR → Core`, `Infrastructure → HR + Core`,
`Auth/Tenants/Approvals → Infrastructure`. **No cycle, zero rework** of Days 1-3 (existing modules
keep the concrete context; only HR uses the interface). Global CompanyEntity query filter + audit
apply automatically to HR entities. Cross-module (e.g. create login for employee) goes via MediatR.
The EF configs for HR entities live in `Infrastructure/Data/Configurations/HR/` (persistence layer
owns mapping; HR stays pure). This is the precedent to migrate the older modules in Phase 2.

**Approval payload encryption:** `ApprovalRequest.CommandJson` is encrypted with
`IApprovalPayloadProtector` (Data Protection) — the payload holds salaries/passwords. Encrypt on
write in `ApprovalCheckBehavior`, decrypt on replay in `ApproveRequestCommandHandler`. Prod note:
persist the Data Protection key ring or a restart can't decrypt in-flight approvals.

**HR design rules:** Employee is a separate entity (optional `UserId` link — not every employee
logs in). Manager is confined to their own department (looked up fresh from the user's DepartmentId).
Salary visible only to CompanyAdmin+ or the employee themselves. EmployeeCode auto-generated per
company with generate-and-retry. HR management requires a company context — a SuperAdmin (no company)
must pass `companyId`; CompanyAdmin uses their own. Module-activation guard (`HrGuard.EnsureHrActive`)
rejects HR writes when the company hasn't activated "HR". Leave day count excludes weekends (Sat/Sun)
+ holidays; leave over-draw is prevented by the balance re-check at execution (which, for approved
leave, runs at approval replay) rather than a submit-time reservation.

## Accounting Module — Phase 2 (July 25–26, 2026)

`Xorva.Modules.Accounting`, feature-foldered (Ledger / Sales / Purchases / Tax / Contacts / Banking /
Assets / Currency / EInvoicing / Reports; cross-cutting engine in `Common/`). References **Core only**
(MediatR + FluentValidation), exactly like HR — persistence via `IXorvaDbContext`. Infrastructure
references the module so `XorvaDbContext` declares the `DbSet<>`s and auto-discovers the EF configs in
`Infrastructure/Data/Configurations/Accounting/`. **Pillars (Auth/Tenants/Approvals/HR/Core) were not
changed** — Accounting only plugs in additively. Every entity extends `CompanyEntity` → automatic
tenant/company isolation for free.

**The engine — `IJournalPoster` (Core) / `JournalPoster` (Accounting).** The double-entry heart. Input
`JournalDraft` is a Core-level DTO (accountId or a well-known `SystemAccount` + debit/credit lines — no
Accounting types leak into Core), so **any** module posts through the Core contract without referencing
Accounting (HR payroll posts salary journals this way). It enforces Σdebit = Σcredit and per-line debit
XOR credit **in code**, checks the period is open (`PeriodGuard`), assigns the number
(`NumberSequence`, unique + retry), writes `JournalEntry` + `JournalLine`, and updates the cached
`Account.CurrentBalance`. **Every document handler posts through it — one set of rules/tests covers
every transaction type.** Reports read the posted lines, never the cache (so they can't drift). Void =
a **reversing** journal (posted entries are immutable).

**`SystemAccount` enum + `AccountingSettings` posting map.** `AccountingSettings` (one row per company,
seeded with the chart) maps well-known roles (AR, AP, Bank, Sales, VAT-Output/Input, Retained Earnings,
Rounding, Salary Expense/Payable, **FxGainLoss**, **UnrealizedFxGainLoss**) to real account ids. The
poster resolves `SystemAccount.X` → the company's account, so cross-module posting needs no ids.

**Department-function access (E1).** `Department.Function` enum (`General/HR/Accounting/Sales/…`). A
**Manager who heads an Accounting-function department is the accountant** — one `Manager` role,
function-driven, no role explosion. `AccountingAccess.HasAsync` (API filter `[RequireAccountingAccess]`)
grants CompanyAdmin+ **or** a Manager heading an Accounting-function dept; `GET /accounting/my-access`
mirrors it to the FE nav gate. (Books are company-wide — one CoA per company.)

**Approvals on money (E9).** Money **posting** commands implement `IApprovableAction` (approval attaches
to the posting that commits to the books, never to draft creation). Registered keys: `Accounting.
PostInvoice/PostBill/RecordPayment/RecordSupplierPayment/ManualJournal/RunPayroll`. `ApprovalRule`
gained an optional nullable `AmountThreshold`; the new `IAmountApprovableAction` (async
`ResolveApprovalAmountAsync(IXorvaDbContext,ct)`) lets `ApprovalCheckBehavior` skip approval below the
threshold and queue at/above it. Null threshold = legacy behavior (every occurrence routed) — the whole
feature is additive and off by default.

**Multi-currency + FX (E7).** Documents keep amounts in their **transaction currency** + an
`ExchangeRate`; the **ledger is always posted in base currency** at that rate (base amounts derived
from the converted components so debits == credits exactly). `ExchangeRateResolver` (latest company
rate on/before the date; base = 1; document override). Settling a foreign doc at a different rate books
a **realized FX gain/loss** (customer: cash − carrying; supplier: carrying − cash). Period-end
**unrealized revaluation** (`RunFxRevaluation`) restates open foreign AR/AP to an as-of rate and posts
to Unrealized FX Gain/Loss with an **auto-reversing** entry next day (so it never double-counts the
realized gain/loss). **Invariant:** the base-currency path (currency == base, rate == 1) is byte-for-byte
unchanged — every FX behavior is a new branch. Contact `OutstandingBalance` is tracked in base currency.

**E-invoicing (E8).** `UblInvoiceBuilder` emits a standards-compliant **UBL 2.1 / PINT AE** XML for a
posted invoice (parties with TRNs, VAT breakdown by category S/Z/E, legal monetary totals, lines) via
`System.Xml.Linq`. It does **not** fabricate Peppol routing ids — missing seller/buyer TRN or address
surface as non-blocking warnings. Seller tax identity lives on `AccountingSettings` (E-Invoicing settings page).

**Multi-company consolidation.** `AccountingGuard.ResolveReportScope(tenant, requestedCompanyId)`
returns a **null (consolidated) scope** when a CEO omits the company. Because the global company filter
is already `TenantId == current && (HasCrossCompanyAccess || CompanyId == current)`, a CEO is confined
to their own tenant, so a null scope safely spans **every company in the tenant and nothing beyond it**.
P&L / Balance Sheet / Trial Balance / dashboard filter `(scope == null || CompanyId == scope)` and
**merge rows by account code** (a no-op for a single company). FE: an "All companies (consolidated)"
toggle (`useReportScope` hook) on those pages, CEO-only.

**Correctness laws (kept):** debits = credits (poster + DB check constraints); posted entries immutable
(reverse, never edit/delete); closed periods reject posting; document + journal in one unit of work;
reports read posted lines, not the cache.

## Accounting — TrueLedge port (Phase 2b, Sept 2026)

Two engines, one ledger. Xorva's `JournalPoster` (C#) and the ported PostgreSQL RPCs
(`accounting.post_voucher_atomic`, `reverse_voucher`, bank matching, document inbox) both write the
same `JournalEntries`/`JournalLines`/`Accounts.CurrentBalance`, and the same rules are enforced twice:
in C# (`PeriodGuard`, `JournalPoster` balance/leaf/cost-centre checks) and in DB triggers
(`trg_journal_entries_period`, balance, immutability, cost-centre leaf). They can never disagree.

- **SQL is source of truth** for the ported schema: `Xorva.Infrastructure/Sql/Accounting/000N_*.sql`
  (embedded resources) run by `SqlScript` inside EF migration `20260917120000_AccountingSqlPort`.
  Idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE`), so re-running is safe. EF entities for the new
  tables are **read-model mappings** of SQL-created tables; the EF snapshot is caught up with an empty
  follow-up migration (see PROGRESS.md).
- **Session context:** `TenantSessionInterceptor` runs `app.set_session_context(user, tenant, company,
  role, crossCompany)` on every opened connection; RLS policies (`app.install_company_rls`) and RPCs
  read it via `app.current_*()`. EF global filters remain — RLS is defence in depth.
  **Supabase notes (target DB since Sept 2026):** connect through the *session* pooler (port 5432) or
  direct — never the transaction pooler (6543): the context is session-scoped (`set_config(..., false)`)
  and EF migrations need real sessions. The `postgres` role Supabase hands out owns the tables and has
  `BYPASSRLS`, so the policies do not filter the API's own connection — isolation for the API is the EF
  global query filter (as before); RLS becomes active for any restricted role (PostgREST, read-only
  analytics users). Schemas `app`/`accounting` are outside `public`, so PostgREST does not expose the RPCs.
- **RPC facade:** `IAccountingRpc` (module `Common/`) implemented by `Infrastructure/Services/AccountingRpc`
  on the DbContext's own connection, so EF writes + RPC run in one Npgsql session/transaction scope.
- **Module boundary:** Accounting must not reference Commerce. Voucher entry / AI inbox need
  customers, suppliers and items, so Accounting declares `IPartyDirectory` and Commerce registers
  `PartyDirectory` in `AddCommerceModule` — the mirror of `IJournalPoster` (Core port, Accounting adapter).
- **Voucher maths** live in the pure `VoucherEngine` (no I/O): compute totals, persisted lines and
  base-currency ledger lines; reject unbalanced/zero entries **before** any write; FX rounding residue
  is absorbed on the balancing line. Handler: validate masters from DB → engine → save draft →
  `post_voucher_atomic`; if posting fails, a voucher created by this call is deleted (TrueLedge
  compensation), an existing draft is left intact.
- **Period close is graded:** `FiscalPeriods.CloseStatus` Open/SoftClosed/HardClosed (legacy
  `IsClosed` kept in step by trigger + handler). SoftClosed: CompanyAdmin+ may post; HardClosed: nobody.
- **AI inbox:** `IDocumentExtractor` (Gemini) is an infrastructure service; the flow is state-machined
  in SQL (`begin/complete/fail_document_extraction`, `accept_document_extraction` links the voucher).
  Files are stored in `AccountingDocumentFiles.Data` (bytea) — no object storage dependency.
- **Report export:** `ReportTable` (renderer-neutral) → `XlsxWriter` (raw SpreadsheetML) / `PdfWriter`
  (raw PDF 1.4, Helvetica). No NuGet additions. Latin-only PDFs; swap `PdfWriter` for QuestPDF + a
  font when Arabic output is needed.
- **Tests:** SQL suite (`Sql/Tests`, Node + pg, real Postgres) covers RPC/trigger semantics; .NET unit
  tests use SQLite + `FakeAccountingRpc` and cover handler logic only.

## Integration testing pattern
`XorvaApiFactory` (Tests.Integration) boots the REAL pipeline with environment **Testing**:
Program skips DbInitializer, InfrastructureExtensions skips Npgsql (empty conn string),
factory swaps DbContext to SQLite in-memory + EnsureCreated. Test config lives in
**appsettings.Testing.json** (dummy JWT key) — NOT in factory ConfigureAppConfiguration,
because with minimal hosting those sources load BEFORE appsettings.json and get overridden.

## Security decisions
- Register endpoint: `[Authorize] + [RequireRole(CompanyAdmin)]`. The handler additionally
  forces non-SystemAdmin callers into their own tenant, and CompanyAdmins into their own company.
- Role hierarchy: caller can only create strictly lower-privilege roles (enum value strictly greater).
- Refresh tokens: opaque, DB-stored, single-use rotation; reuse revokes ALL user sessions.
- Generic "Invalid credentials." on login — no email enumeration.
- Unique index `(Email, TenantId)` is `NULLS NOT DISTINCT` (PG15+) so SystemAdmin emails are unique at DB level.
- Secrets: dev = dotnet user-secrets on Xorva.API (`ConnectionStrings:DefaultConnection`,
  `JwtSettings:SecretKey`, optional `SeedSettings:SystemAdminPassword`). Prod = env vars.
  appsettings.json contains empty placeholders only.

## Middleware order (do not change)
Exception → RequestLogging → Swagger(dev) → CORS → Authentication → TenantResolver → Authorization → Controllers

## Frontend conventions
- Tailwind v4: brand palette lives in `src/index.css` under `@theme` (colors: void, abyss,
  surface, primary, glow, frost, frost-dim, dim, danger, success, warning). Buttons rounded-lg (8px),
  cards rounded-2xl (16px) per brand guidelines.
- All API calls go through `src/api/client.ts` (JWT header + silent refresh; refresh logic
  skips /auth/login and /auth/refresh).
- Client validation mirrors backend FluentValidation exactly (`src/utils/validation.ts`).
- RBAC helpers mirror the backend hierarchy (`src/utils/roles.ts`).
- Dev proxy: vite.config.ts `/api` → `http://localhost:5270` (must match launchSettings.json).
- **TrueLedge-port screens (Phase 3)** live beside the older accounting pages and follow the same
  patterns (`AppShell`, `useAuth`/`useCompany` company scoping, `useReportScope` for reports,
  `useToast`, `components/ui` primitives, `Pill`/`StatTile` from `dashboard-ui`). Their API client is
  `src/api/ledger.api.ts` (types mirror the C# DTOs 1:1; enums are string unions because the API
  serialises enums as strings). Shared helpers: `fmtMoney`, `fmtDate`, `todayIso`, `VOUCHER_STATUS_TONE`.
- `SearchSelect` (`components/accounting/`) is the keyboard combobox for the voucher grid — it swallows
  Enter only while its list is open so the grid's "Enter = next field" handler keeps working.
- File downloads (`exportReport`) and file previews (inbox) go through the axios client with
  `responseType: 'blob'` so the JWT header is attached; never link to `/api/...` directly.
- Inbox → voucher hand-off uses router state (`navigate('/accounting/vouchers/new', { state: { prefill } })`),
  and the entry page calls `acceptDocument` after a successful post to link the document.
