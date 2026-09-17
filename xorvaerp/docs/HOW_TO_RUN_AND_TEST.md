# Xorva ERP — How to Run & Test

> **Status (today):** Backend **110 automated tests pass** (97 unit + 13 integration), frontend
> builds clean, and the **Neon database is fully migrated** (25 migrations applied, 0 pending —
> incl. the whole Accounting module). Demo logins below are **verified working** on Neon.

## 1. Start the backend (API)

Open a terminal (VS Code terminal is fine) and run:

```bash
cd c:\Users\HP\Desktop\xorvaErp\backend
dotnet run --project Xorva.API
```

- Runs on **http://localhost:5270** · Swagger UI: **http://localhost:5270/swagger**
- Uses the **Development** profile → connects to your **Neon** database and **auto-applies any
  pending migrations at startup** (DbInitializer). Nothing manual needed.
- Leave this terminal open. Stop it with **Ctrl + C**.

## 2. Start the frontend (React)

Open a **second** terminal and run:

```bash
cd c:\Users\HP\Desktop\xorvaErp\frontend
npm run dev
```

- Opens on **http://localhost:5173** (Vite proxies `/api` → 5270). Leave it open; stop with **Ctrl + C**.

Open **http://localhost:5173** → landing page → "Sign in".

**Demo accounts (verified working on Neon):**
| Role | Email | Password |
|------|-------|----------|
| CEO (SuperAdmin) | `demo.ceo@xorva.local` | `DemoCeo@2026!` |
| Company Admin | `demo.admin@xorva.local` | `Admin@2026!` |

> The CEO account shows the onboarding wizard first (it predates onboarding) — click
> **"Finish & go to dashboard"**; it won't ask again.

---

## 3. Browser walkthrough — the full demo

### 3a. Phase 1 (Auth · Tenancy · HR · Approvals)
1. Sign in as **CEO** → dashboard (companies, headcount, approvals). Use the **company switcher** (top bar).
2. **HR → Employees** → create an employee (auto-code `EMP-0001`), edit, list/filter.
3. **HR → My Leave / Leave Types** → seed defaults, apply for leave (balance drops).
4. **Approvals → Rules** → create a rule (e.g. *New Hire → CEO*). Then create an employee as a
   **Company Admin** → it returns **"Submitted for approval"** → CEO **Approvals → Inbox** → Approve → it's created.

### 3b. Phase 2 (Accounting) — activate it first
Accounting is a **per-company module**, off by default. Turn it on, then use it:

1. **CEO → Companies → (a company) → Modules** → tick **Accounting** → save.
   *(Or run once: `POST /api/companies/{id}/modules` with `{ "companyId": "...", "modules": ["HR","Accounting"] }`.)*
2. **Accounting → Chart of Accounts** → pick an industry template (General/Trading/Construction/
   Staffing/Software) → the full chart is seeded. (This also creates the posting settings + tax rates.)
3. **Accounting → Contacts** → add a customer (with a TRN).
4. **Accounting → Invoices** → New invoice → add a line → **Create** (draft) → **Post**. Posting
   auto-creates the balanced journal (DR Receivable / CR Sales / CR VAT).
5. **Accounting → Payments** → record a payment against that invoice → it settles; bank balance rises.
6. **Accounting → Reports**: **Profit & Loss**, **Balance Sheet** (balances), **Trial Balance**
   (debits = credits), **Cash Flow**, **Aged Receivables/Payables**, **VAT Return**.
7. **Accounting → Bills / Supplier Payments** → mirror of invoices (DR Expense / DR VAT-Input / CR Payable).
8. **Multi-currency:** **Accounting → Exchange Rates** → add e.g. `USD = 3.67`. Create an invoice
   in **USD** → post → the ledger records it in **AED** at that rate. Pay it later at a different
   rate → a realized **FX gain/loss** is booked. The Exchange Rates page also has **"Run period-end
   revaluation"** (unrealized FX on open foreign balances, auto-reverses next day).
9. **E-invoicing:** on a **posted** invoice → **"e-Invoice"** → a **UBL 2.1 / PINT AE** XML preview
   with copy + download. (Set your seller TRN under **Accounting → E-Invoicing** first.)
10. **Approvals on money:** create a rule for `Accounting.PostInvoice` (optionally with an **amount
    threshold**, e.g. only invoices ≥ 50,000 need sign-off). Post an invoice as Company Admin →
    **202 pending** → CEO approves → the journal is created.
11. **Consolidation (CEO only):** on P&L / Balance Sheet / Trial Balance / the Accounting dashboard,
    tick **"All companies (consolidated)"** → figures aggregate across every company in the tenant.

> **Department-function access:** a **Manager who heads an Accounting-function department** gets full
> accounting access (they *are* the accountant). Set a department's **Function = Accounting** under
> **HR → Departments**. Otherwise Accounting is Company Admin & above.

---

## 4. Test in Postman / Swagger (optional)

- **Postman:** Import `docs/Xorva.postman_collection.json`. Run **Auth → Login** once (captures the
  token; every request reuses it). IDs auto-save between requests. *(Collection covers Phase-1
  flows; Accounting endpoints are under `/api/accounting/...` — see `context/API_CONTRACTS.md`.)*
- **Swagger:** http://localhost:5270/swagger → `POST /api/auth/login` → copy `accessToken` →
  **Authorize** (paste token) → every endpoint is callable. Accounting endpoints appear once you're
  authorized as Company Admin+ on a company with Accounting active.

---

## 5. Run the automated test suite (proves it works without clicking)

```bash
cd c:\Users\HP\Desktop\xorvaErp\backend
dotnet build XorvaERP.slnx     # 0 errors / 0 warnings
dotnet test XorvaERP.slnx      # 110 tests pass (97 unit + 13 integration)
```
```bash
cd c:\Users\HP\Desktop\xorvaErp\frontend
npm run build                  # tsc + vite build, succeeds
```

Tests use a throwaway **SQLite in-memory** database (fast, never touches Neon), so they prove the
**logic**; the live **Neon** connection is proven separately by the API booting and serving requests
(step 1). The integration tests run the real HTTP pipeline end-to-end, including the full accounting
cycle (activate → invoice → post → pay → P&L), approval-gated posting, and CEO consolidation.

---

## 6. Quick reference — what each role can do

| Role | Sees / does |
|------|-------------|
| **System Admin** | Platform overview (tenant/company/user counts) |
| **CEO (SuperAdmin)** | All companies (incl. **consolidated** reports), headcount, approvals, company switcher, onboarding |
| **Company Admin** | Their company: HR + full Accounting + approvals + rules + settings |
| **Manager (Accounting dept)** | Full Accounting for the company (the accountant) |
| **Manager (other dept)** | Their department's employees + leave approvals (no Accounting) |
| **Employee** | Own profile, leave balance, apply for leave |

---

## 7. Troubleshooting

- **Login fails for a demo account** → make sure the backend (step 1) is running and pointed at Neon
  (Development profile). Both demo logins above are verified on Neon.
- **Accounting menu is missing / "module not active"** → activate Accounting for that company (step 3a.1).
- **"Accounting is not set up"** → seed the Chart of Accounts for that company (step 3b.2).
- **Excel test tracker won't save an update** → close it in Excel first (an open file is locked).
- **First-ever boot with an empty DB** → set `SeedSettings:SystemAdminPassword` in user-secrets so a
  SystemAdmin is seeded. (Your Neon already has accounts, so this isn't needed.)
