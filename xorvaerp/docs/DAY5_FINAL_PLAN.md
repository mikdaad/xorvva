# Xorva ERP — Day 5: Final Plan (merged, canonical)

**This is the single source of truth for Day 5.** It merges the best of
`DAY5_UI_DASHBOARD_DESIGN.md` (Claude) and `DAY5_UI_DASHBOARD_FLOWS.md` (Antigravity),
resolving the one real disagreement (onboarding) into a stronger combined approach.

**Going in:** Days 1–4 complete, 35/35 tests green, build 0/0. Day 5 = the experience layer.
**Testing:** the full test pass + new tests are deferred to the pre-demo session tomorrow.
Today we **complete the UI/polish** and keep the existing 35 tests green (run, don't break).

---

## 1. Onboarding — skippable first-login WIZARD + dashboard CHECKLIST (the synthesis)

The two source docs disagreed: stakeholder wants a first-login wizard (ask # companies + modules
per company); best practice says use a non-blocking checklist. **Do both — they're complementary:**

- **Signup stays atomic/minimal:** account + organization + first company → `RegisterTenant` → auto-login.
- **First login → if tenant not onboarded → `/onboarding` WIZARD** (delivers sir's requirement):
  - Welcome
  - Company 1 (from signup): confirm name/currency/timezone + **pick its modules**
  - **"Add another company"** loop — each new company gets name/currency/timezone + its own modules
  - (optional) branches per company; HR quick-start (seed departments / leave types)
  - **Every step has "Skip for now."** Finish (or skip) → stamp onboarded → dashboard.
- **Dashboard "Getting started" checklist** shows anything skipped (activate modules, add employee,
  configure rules…) so the user can resume freely. Auto-hides when the essentials are done.
- **Detection (server-side, cross-device):** nullable `Tenant.OnboardedAt`; `GET /tenants/current`
  returns it; `POST /api/tenants/complete-onboarding` (CEO) stamps it. Login routes on this flag.

Why this is best: the wizard is the *guided path* sir asked for; the checklist is the *non-blocking
resume mechanism* Antigravity correctly wants. Mature SaaS does exactly this.

---

## 2. Navigation — sidebar (from BOTH docs) + the details Antigravity caught

- **Left sidebar** (240px, collapsible), grouped + role-aware; **top header** with brand,
  **company switcher** (Claude — solves the CEO `companyId` friction), notifications bell
  (badge = pending approvals), user menu (name • role • company, sign out).
- **Widen the content area:** `max-w-5xl` → `max-w-7xl`/fluid (Antigravity — a sidebar layout needs width).
- **Module-activation guard on nav (Antigravity):** hide HR links when the active company hasn't
  activated the HR module (mirrors the backend `HrGuard`). No dead links that 403.
- Groups: Overview (Dashboard) · Organization (Companies, Branches) · People/HR (Employees,
  Departments, Designations, Holidays, Leave Types) · Leave (My Leave) · Approvals (Inbox, Rules,
  History) · Settings (Users). Mobile: drawer.

Role visibility (merged from both docs):

| Item | SysAdmin | CEO | CompanyAdmin | Manager | Employee |
|---|:-:|:-:|:-:|:-:|:-:|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| Companies / Branches | — | ✅ | ✅ | view | — |
| Employees / Departments | — | ✅ | ✅ | own dept | — |
| Designations / Leave Types | — | ✅ | ✅ | — | — |
| Holidays | — | ✅ | ✅ | view | view |
| My Leave | — | — | — | ✅ | ✅ |
| Approvals Inbox / History | — | ✅ | ✅ | ✅ | — |
| Approval Rules | — | ✅ | ✅ | — | — |
| Users (Settings) | — | ✅ | ✅ | — | — |

---

## 3. Role dashboards — one endpoint, role-shaped response

**`GET /api/dashboard`** returns the caller's summary in one round-trip (server-computed).
Widget detail taken from Antigravity's per-role tables (it was more thorough); layout uses
reusable **stat-tile** + **section-card** components.

- **System Admin (minimal, confirmed):** platform tiles — total tenants, companies, users,
  active-this-month — from `GET /api/admin/overview` (SystemAdmin-only, bypasses tenant filters);
  optional recent-signups + DB/health line. Dashboard only in the sidebar. *(Full console = later.)*
- **CEO / SuperAdmin:** tiles (Companies · Total headcount · Pending approvals · Active modules);
  widgets (companies-with-headcount, pending-approvals preview, recent activity, getting-started
  checklist); **headcount-by-company bar chart** (Recharts); quick actions (New Company, Add User, New Rule).
- **Company Admin:** tiles (Headcount · Departments · Pending approvals · On-leave-today); widgets
  (pending preview, department breakdown, recent hires, who's-out-today); quick actions (Add Employee, New Department, Rules).
- **Manager:** tiles (Team size · Pending leave approvals · Team on leave); widgets (my team, my inbox,
  team leave this week); quick actions (Review approvals, View team).
- **Employee:** tiles (leave balance per type · my pending requests); widgets (balance cards, recent
  requests, profile summary); quick actions (Apply for Leave, View profile).

---

## 4. Pages & polish (merged; Antigravity's concrete catches included)

- **Placeholder landing page** (`/`): brand hero + value line + feature cards + "Get Started"/"Sign In".
  Dark theme, existing tokens. Deliberately simple — not a marketing site.
- **Employee profile page** (`/hr/employees/:id`) — Antigravity caught this was missing: a read/edit
  profile with sections (personal, employment, salary [permission-gated], history) + salary/status actions.
- **Reusable components:** StatTile, SectionCard, PageHeader; one Recharts chart honoring the palette.
- **States audit:** every list/page has loading, empty (icon + hint), and error (alert).
- **Light i18n:** wire i18next with an English resource + wrap shell strings; Arabic/RTL structure stubbed.

---

## 5. Build order (checkpointed; keep the 35 tests green)

1. **App shell:** Sidebar + Header (company switcher, bell, user menu), wider content, module-aware nav → all pages inherit. Build.
2. **Backend:** `Tenant.OnboardedAt` (+ migration), `POST /tenants/complete-onboarding`, `GET /api/dashboard` (role-shaped) + `GET /api/admin/overview`. **Run the 35 tests — stay green.**
3. **Role dashboards:** one `DashboardPage` rendering per-role widgets from the summary. Proxy check.
4. **Onboarding:** first-login routing on `OnboardedAt`; skippable wizard (dynamic companies+modules); dashboard checklist.
5. **Pages/polish:** landing, employee profile page, StatTile/Card/chart, states audit, light i18n.
6. **Sanity E2E (manual):** signup → wizard → add employees → apply leave → approve → dashboards reflect it. Context docs, commit, push.
7. **(Tomorrow, pre-demo):** full automated test pass + new dashboard/onboarding tests + lead walkthrough.

---

## 6. Scope guard (final day)

**In:** sidebar shell + company switcher + module-aware nav, wider layout, `Tenant.OnboardedAt` +
onboarding wizard + checklist, `GET /api/dashboard` + admin overview, 5 role dashboards, employee
profile page, one chart, placeholder landing, light i18n, states audit.
**Out (later):** real marketing landing, SystemAdmin billing/tenant-drilldown console, Attendance/
Documents/Payroll modules, TanStack Query refactor, full Arabic translation, RLS, rate limiting,
notifications beyond a pending-count badge.

> The engine is built and tested. Day 5 turns "a set of API pages" into "a product": navigation
> that scales, onboarding that guides (but never traps), and a dashboard per role that answers
> "what needs my attention?"
