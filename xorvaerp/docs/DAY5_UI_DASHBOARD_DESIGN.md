# Xorva ERP — Day 5: UI, Navigation, Onboarding & Role Dashboards

**Day:** 5 (final) · **Goal:** give the working engine a professional, role-aware face.
**Status going in:** Days 1–4 complete, 35/35 tests, 50 endpoints, 15 pages. Build 0/0.

This document is the design + build plan for the Day-5 experience layer. No new business
logic — this is navigation, onboarding, dashboards, and polish on top of what already works.

---

## 0. Audit verdict (why this day exists)

The backend and data layer are professional and tested. The **experience layer** is the gap:

| Problem | Fix (this day) |
|---|---|
| Flat top nav with 12+ items — doesn't scale | **Sidebar** with role-aware grouped sections |
| Every role lands on the same generic page | **5 role-specific dashboards** |
| CEO must hand-pass `companyId` for HR/company actions | **Company switcher** in the header |
| No first-run guidance after signup | **Onboarding wizard + setup checklist** |
| i18n unwired, no landing page | Placeholder landing + i18n scaffold (light) |

---

## 1. Navigation — from top bar to sidebar (the biggest win)

Replace the horizontal nav with a **left sidebar** (collapsible) + a **top header**. The sidebar
is grouped and role-aware; a user only sees sections they can use.

```
┌───────────────┬─────────────────────────────────────────────┐
│  X  Xorva     │  [Company ▾]           🔔   Aamir  ▾  Sign out│  ← header
├───────────────┼─────────────────────────────────────────────┤
│ OVERVIEW      │                                             │
│  • Dashboard  │        (role dashboard / page content)      │
│ ORGANIZATION  │                                             │
│  • Companies  │                                             │
│  • Branches   │                                             │
│ PEOPLE (HR)   │                                             │
│  • Employees  │                                             │
│  • Departments│                                             │
│  • Designations│                                            │
│ LEAVE         │                                             │
│  • My Leave   │                                             │
│  • Leave Types│                                             │
│  • Holidays   │                                             │
│ APPROVALS     │                                             │
│  • Inbox      │                                             │
│  • Rules      │                                             │
│  • History    │                                             │
│ SETTINGS      │                                             │
│  • Users      │                                             │
└───────────────┴─────────────────────────────────────────────┘
```

**Group visibility by role** (least-privilege — never show a link that 403s):

| Group / item | SystemAdmin | CEO (SuperAdmin) | CompanyAdmin | Manager | Employee |
|---|:-:|:-:|:-:|:-:|:-:|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| Organization (Companies, Branches) | — | ✅ | ✅ | view | — |
| People (Employees, Departments) | — | ✅ | ✅ | own dept | — |
| Designations, Leave Types, Holidays | — | ✅ | ✅ | — | — |
| My Leave | — | — | — | ✅ | ✅ |
| Approvals · Inbox | — | ✅ | ✅ | ✅ | — |
| Approvals · Rules | — | ✅ | ✅ | — | — |
| Approvals · History | — | ✅ | ✅ | ✅ | — |
| Settings · Users | — | ✅ | ✅ | — | — |

Header: brand, **company switcher** (see §2), a notifications bell (badge = pending approvals
count), user menu (name, role, sign out). Mobile: sidebar collapses to a drawer.

---

## 2. Company switcher (solves the CEO friction cleanly)

A SuperAdmin (CEO) spans all companies, so HR/company writes need a target company. Instead of
asking the user to paste an id, the header carries an **active company** selector (persisted in
localStorage). The frontend sends that `companyId` on HR/company create calls. CompanyAdmin and
below have exactly one company, so the switcher is hidden/locked for them. This is a UX fix for an
architectural fact — no backend change.

---

## 3. Onboarding — DYNAMIC first-login wizard (confirmed requirement)

**Requirement (from the stakeholder):** when someone signs up and logs in **for the first time**,
ask them dynamically about their companies — **how many companies** they want, and **which modules
for each company** — then take them to their dashboard.

**Flow the customer experiences:**

```
Landing (placeholder)  →  "Get started"
   ▼
Signup (atomic, minimal):  your account (name/email/password) + organization name + first company
   [Submit] → RegisterTenant (Tenant + first Company + CEO, one transaction) → auto-login
   ▼
FIRST LOGIN → onboarding not complete → DYNAMIC ONBOARDING WIZARD:
   • Welcome
   • Company 1 (the one from signup): confirm name/currency/timezone + pick its MODULES (checkboxes)
   • "Add another company?"  → repeat dynamically: name/currency/timezone + module selection
     (the CEO adds as many companies as they want, each with its own modules)
   • (Optional) branches per company; HR quick-start (seed departments / leave types)
   • Finish → mark tenant onboarded → dashboard
   ▼
Subsequent logins → straight to dashboard (wizard not shown again)
```

**How "first login" is detected (professional, cross-device):**
- Add a nullable `Tenant.OnboardedAt` (or `IsOnboarded`) flag. `GET /api/tenants/current` returns it.
- On login the frontend checks it: not onboarded → route to `/onboarding`; onboarded → `/dashboard`.
- The wizard's Finish calls a small `POST /api/tenants/complete-onboarding` (CEO only) that stamps it.
- This is server-side state, so it works on any device (not a localStorage guess).

**Design decisions:**
- **Signup stays atomic/minimal** (org + first company + CEO). The dynamic "how many companies /
  which modules" happens in the **first-login wizard**, calling existing endpoints
  (`POST /companies`, `PUT /companies/{id}/modules`, `POST /branches`, HR seed). Robust, resumable,
  reuses everything — never a giant transactional signup.
- The wizard is **dynamic**: an "Add another company" loop, each company getting its own module set.
- A **Getting started checklist** on the dashboard remains for anything skipped (add employees, etc.).

---

## 4. Role dashboards (the heart of Day 5)

Each dashboard answers two questions: **"what's the state of my world?"** (stat tiles) and
**"what needs my attention?"** (action widgets), plus **quick actions**. A single role-aware
endpoint `GET /api/dashboard` returns the caller's summary in one round-trip (server-computed
counts), so the page is fast and doesn't fan out to many list calls.

### 4.1 System Admin (platform owner — "us") — MINIMAL OVERVIEW (confirmed)
Internal role; customers never see it. Day-5 scope: a small SystemAdmin-only endpoint
`GET /api/admin/overview` (deliberately bypasses tenant filters) returning platform stat tiles —
total tenants, companies, users, and active-this-month — rendered as a simple read-only overview
page. Full billing/subscription/tenant-drilldown console is a later phase.

### 4.2 CEO / Tenant SuperAdmin (whole tenant)
- **Tiles:** Companies · Total headcount (all companies) · Pending approvals (mine to act on) · Active modules
- **Widgets:** Companies with headcount · Pending-approvals preview (top 5) · Recent activity (approvals) · Getting-started checklist
- **Quick actions:** New Company · Add User · New Approval Rule
- **Chart (optional):** headcount by company (bar)

### 4.3 Company Admin / GM (one company)
- **Tiles:** Headcount · Departments · Pending approvals · On leave today
- **Widgets:** Pending-approvals preview · Department breakdown (with counts) · Recent hires · Who's out (approved leave overlapping today)
- **Quick actions:** Add Employee · New Department · Approval Rules

### 4.4 Manager (one department)
- **Tiles:** My team size · Pending leave approvals (my inbox) · Team on leave this week
- **Widgets:** My team list · Pending approvals (mine) · Team leave calendar (this week)
- **Quick actions:** Review approvals · View team

### 4.5 Employee (self-service)
- **Tiles:** Leave balance per type (Annual / Sick / …) · My pending requests
- **Widgets:** Leave balance cards · My recent leave requests · My profile summary
- **Quick actions:** Apply for Leave · View my profile

---

## 5. Design-system polish (consistency pass)

The Xorva dark theme + Tailwind kit already exist. Day-5 polish:
- **App shell**: sidebar + header + content region; breadcrumbs; consistent page headers.
- **States**: every list has loading (spinner), empty (icon + hint), and error (alert) — audit each page.
- **Stat tile** + **section card** components (reused across dashboards).
- **Charts**: a single lightweight bar/pie via Recharts (already a dependency) for headcount, respecting the palette.
- **Notifications bell**: badge = pending-approvals count (poll on nav, cheap).
- **Placeholder landing page**: brand hero + "Get started" / "Sign in" — deliberately simple now.
- **i18n (light)**: wire i18next with an English resource file and wrap the shell strings; Arabic/RTL structure stubbed for later.

---

## 6. Day-5 build order (checkpointed)

1. **App shell**: `Sidebar` + `Header` (company switcher, user menu, bell) → replace top-nav `AppShell`. All pages inherit it. ✅ build.
2. **Dashboard endpoint**: `GET /api/dashboard` role-aware summary (+ SystemAdmin overview if kept). Unit/integration test. ✅ build + tests.
3. **Role dashboards**: one `DashboardPage` that renders the right widgets by role, from the summary endpoint. ✅ proxy check.
4. **Onboarding**: signup wizard steps + post-login guided setup + dashboard checklist card.
5. **Polish**: stat-tile/card components, one Recharts chart, empty/loading/error audit, placeholder landing, light i18n.
6. **Full E2E**: signup → setup → add employees → apply leave → approve → dashboards reflect it. Context docs, commit, push.

---

## 7. Scope guard (final day)

**In:** sidebar shell, company switcher, `GET /api/dashboard`, 5 role dashboards (SystemAdmin
minimal), onboarding wizard + checklist, polish, placeholder landing, light i18n.
**Out (later):** real landing/marketing site, SystemAdmin billing console, Attendance/Documents/
Payroll modules, TanStack Query refactor, full Arabic translation, PostgreSQL RLS, notifications
beyond a pending-count badge.

> The engine is built and tested. Day 5 is the face: navigation that scales, an onboarding that
> guides, and a dashboard per role that answers "what needs my attention?"
