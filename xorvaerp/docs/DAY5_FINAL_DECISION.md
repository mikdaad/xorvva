# Day 5 — FINAL DECISION: Merged Plan

**You're exhausted. I'll be direct. No fluff.**

---

## Quick Verdict

| | My Doc (DAY5_UI_DASHBOARD_FLOWS) | Claude's Doc (DAY5_UI_DASHBOARD_DESIGN) | Winner |
|---|---|---|:---:|
| Sidebar structure | ✅ Has it | ✅ Has it (same idea) | **Tie** |
| Role dashboards (5 variants) | ✅ Detailed widgets per role | ✅ Detailed widgets per role | **Tie** |
| Dashboard API | `GET /api/dashboard/stats` | `GET /api/dashboard` | **Tie** (same thing) |
| Landing page | ✅ Placeholder concept | ✅ Placeholder concept | **Tie** |
| **Company Switcher** | ❌ Missing | ✅ Header dropdown for CEO to pick active company | **Claude** |
| **Dynamic Onboarding Wizard** | Checklist only (passive) | ✅ Full wizard: "How many companies? Which modules?" | **Claude** |
| **`Tenant.OnboardedAt` flag** | ❌ Used localStorage | ✅ Server-side flag, works cross-device | **Claude** |
| **Notification bell** | ❌ Missing | ✅ Badge = pending approvals count | **Claude** |
| **i18n scaffold** | Mentioned as P2 | ✅ Wire i18next with English file | **Claude** |
| **Company switcher for CEO** | ❌ Didn't solve this | ✅ Solves CEO "which company?" problem | **Claude** |
| Employee profile page | ✅ Mentioned | ❌ Not mentioned | **Mine** |
| Module activation guard | ✅ Mentioned | ❌ Not mentioned | **Mine** |

---

## The 3 Things Claude Got Right That I Missed

### 1. Company Switcher (Critical UX Fix)

**The problem:** CEO spans ALL companies. When they click "Add Employee", which company does it go to? Currently the CEO has to... somehow know which companyId to send. That's broken UX.

**Claude's solution:** A dropdown in the header: `[RightSource Trading ▾]`. CEO picks the active company. Frontend stores it in localStorage and sends it on HR/company write calls. CompanyAdmin and below don't see it (they have exactly one company).

**This is the right call.** Every multi-entity ERP (SAP, Odoo, ERPNext) has this exact pattern. Without it, the CEO experience is broken.

### 2. Dynamic Onboarding Wizard (Not Just a Checklist)

**My approach:** Passive checklist on dashboard ("Step 1: ✅ Done, Step 2: ⬜ Do this").

**Claude's approach:** Active wizard on FIRST LOGIN: "Welcome → Confirm your company → Pick modules → Add another company? → Finish". Then the checklist on dashboard for the rest.

**Claude is right.** A wizard on first login converts better than a passive checklist. The checklist stays for things they skip (add employees, departments, etc.). Both together is the professional pattern.

### 3. `Tenant.OnboardedAt` Server-Side Flag

**My approach:** I mentioned first-login but didn't specify HOW to detect it.

**Claude's approach:** Add `Tenant.OnboardedAt` (nullable DateTime). `GET /api/tenants/current` returns it. Frontend checks: null → route to `/onboarding`; not null → route to `/dashboard`. After wizard, `POST /api/tenants/complete-onboarding` stamps it.

**This is correct architecture.** Server-side state works across devices and browsers. A localStorage flag would break if the CEO logs in from a different machine.

---

## What to Build — ONE List, Prioritized for Demo Tomorrow

You said testing can wait. Focus on what the **lead will SEE** tomorrow.

### MUST DO (Demo-Critical) — ~4-5 hours

| # | Task | Why Demo Needs It |
|---|------|-------------------|
| 1 | **Sidebar navigation** (replace AppShell header nav) | First thing anyone sees. Current nav screams "prototype" |
| 2 | **Company Switcher** in header (CEO only) | Without it, CEO can't use HR pages properly |
| 3 | **Role-specific DashboardPage** (render different widgets per role) | Dashboard is the LANDING PAGE after login |
| 4 | **`GET /api/dashboard`** endpoint (role-aware, one round-trip) | Powers the dashboard |
| 5 | **Landing page** (`/` — placeholder hero + Sign Up / Log In) | The demo STARTS here |

### SHOULD DO (Professional Polish) — ~2-3 hours

| # | Task | Why |
|---|------|-----|
| 6 | **Onboarding wizard** (first login → setup companies/modules) | Shows the lead "we thought about the full user journey" |
| 7 | **`Tenant.OnboardedAt`** flag + `POST /api/tenants/complete-onboarding` | Supports the wizard |
| 8 | **Notification bell** (badge = pending approvals count) | Small effort, big visual impact |
| 9 | **Empty/loading/error states** audit on all pages | Professional polish |
| 10 | **Update PROGRESS.md** | Documentation for the lead |

### SKIP (Not for Demo) — Do Later

| Task | Why Skip |
|------|----------|
| TanStack Query refactor | Works fine with raw axios for demo |
| i18n wiring | English-only is fine for demo |
| Employee profile page (`/employees/:id`) | List page is enough for demo |
| Module activation guard | Edge case — demo won't hit it |
| Rate limiting | Backend concern, invisible in demo |
| Full test suite | You said skip this |

---

## The Demo Script (What to Show the Lead Tomorrow)

```
1. Open landing page (/)
   → Beautiful dark theme, "Get Started" button

2. Click "Sign Up"
   → Fill: "RightSource Group" / "RightSource Trading" / CEO info
   → Submit → Auto-login

3. Onboarding Wizard appears (first login)
   → Confirm company → Select modules (HR, Accounting) → "Add another company?"
   → Add "RightSource IT" → Select modules (HR) → Finish

4. CEO Dashboard loads
   → Tiles: 2 Companies, 0 Employees, 0 Pending Approvals
   → Getting Started Checklist: "Add departments, Add employees..."

5. Sidebar: Click Departments → Create "Engineering", "Sales"
   Sidebar: Click Designations → Create "Senior Engineer", "Manager"
   Sidebar: Click Employees → Create "Ahmed" (Engineering, Senior Engineer)

6. Company Switcher: Switch to "RightSource IT"
   → Dashboard refreshes with IT data (0 employees)

7. Switch back to Trading
   Sidebar: Click Approval Rules → Create rule: "Leave Request → Manager"

8. Log out → Log in as Ahmed (Employee)
   → Employee Dashboard: profile summary, leave balance cards
   Sidebar: Click "My Leave" → Apply for leave → "Submitted for approval" (202)

9. Log out → Log in as CEO
   → CEO Dashboard: 1 Pending Approval
   → Sidebar: Approvals → Inbox → "Ahmed - Annual Leave" → Approve

10. Log in as Ahmed again → Leave shows "Approved ✅"
```

**That's a 5-minute demo that shows:** Multi-tenancy → Onboarding → HR → Approval Engine → Role-based access. Everything.

---

## Architecture for `GET /api/dashboard`

**One endpoint. Role-aware. Server-computed.**

```
DashboardController.cs
  [Authorize]
  GET /api/dashboard → sends to MediatR:
    GetDashboardQuery → GetDashboardQueryHandler

Handler reads:
  - _tenant.Role → decides WHAT to compute
  - _tenant.TenantId / CompanyId → decides SCOPE

Returns:
  ApiResponse<DashboardDto> where DashboardDto has nullable sections:
  {
    // CEO sees these
    companyCount, totalEmployees, companySummary[],
    // CompanyAdmin sees these  
    departmentCount, onLeaveToday, recentHires[],
    // Manager sees these
    teamSize, teamOnLeave,
    // Employee sees these
    myProfile, leaveBalance[],
    // Everyone sees these
    pendingApprovalCount, recentApprovals[]
  }
```

Each role gets only their relevant fields populated. Null fields are omitted from JSON (`JsonIgnoreCondition.WhenWritingNull` already set in Program.cs).

---

## Final Answer

> **Follow Claude's document structure** (it has the Company Switcher, Wizard, and OnboardedAt which are architecturally correct) **but add these from mine:**
> - Module activation guard (SHOULD DO, not MUST DO)  
> - Employee profile page (SKIP for demo)
>
> **The build order is:** Sidebar → Company Switcher → Dashboard endpoint → Role dashboards → Landing page → Onboarding wizard → Polish.
>
> **Start coding NOW. You have ~6-8 hours. The demo script above is your target.**
