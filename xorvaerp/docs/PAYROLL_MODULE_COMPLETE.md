# Xorva ERP — Complete Payroll System (Master Plan)

**Project:** Xorva ERP (Multi-Tenant Cloud ERP)
**Phase:** Phase 3 — Payroll (the "pay people, compliantly" engine)
**Where it lives:** **inside `Xorva.Modules.HR`** (a `Payroll/` feature-area) — payroll is computation on employee data. It posts to Accounting only through the Core `IJournalPoster` (no module-to-module reference). Sold as a per-company **"Payroll" feature flag**.
**Goal:** A **complete** UAE payroll system (structure → run → payslip → **WPS** → **gratuity** → books), **not** a "type the net salary" form.
**References:** UAE MoHRE Wage Protection System (WPS); Federal Decree-Law No. 33 of 2021 (UAE Labour Law); GPSSA (pension for nationals); Zoho Payroll (UAE), Bayzat, Wafeq Payroll.
**Compliance:** UAE — **no personal income tax**; mandatory WPS salary transfer; statutory end-of-service gratuity; GPSSA pension for UAE/GCC nationals.
**Status:** For Lead Approval

> **Companion documents:** `ACCOUNTING_MODULE_COMPLETE.md` (the module this feeds), `HOW_TO_RUN_AND_TEST.md`. This document is the master scope for Payroll.

---

## 0. "Salary data entry" vs COMPLETE payroll — the whole point

Many tools *look* like payroll but are a spreadsheet with a Save button. **Complete payroll is the intelligence + compliance** that makes the numbers correct, legal, and posted to the books automatically.

| Just "data entry" (a form) | What makes it **COMPLETE payroll** |
|---|---|
| Type each person's net salary | A **salary structure** (basic + allowances − deductions) → the run **computes** gross → net |
| A list of amounts | **Proration** for mid-month join/leave and **unpaid leave** pulled from the HR leave data we already store |
| "Mark as paid" | A **WPS SIF file** in the exact format a UAE bank/exchange accepts (the only legal way to pay salaries) |
| — | **Gratuity / End-of-Service** accrued monthly and settled correctly on exit (UAE Labour Law tiers) |
| — | Every run posts **balanced salary journals** to the ledger via the engine we already built |
| — | Itemized **payslips (PDF)**, **approval gate**, **immutable** posted runs, full audit trail |

The forms are ~30%; the calc engine, WPS, gratuity, and journals are the ~70% that "complete payroll" means. Notably, UAE payroll is **simpler than Western payroll** (no income-tax engine) but its **compliance artifacts (WPS + gratuity) are the hard, valuable part** — that is where we invest.

---

## 1. The launch pad — Phase 1 + Phase 2 already deliver most of the foundation

| Already built | Why Payroll needs it |
|---|---|
| **HR `Employee`** — basic salary, currency, bank name/account/IBAN, join date, employment type, department | The raw inputs of every payslip already exist |
| **HR leave** (`LeaveRequest` / `LeaveAllocation`, weekend/holiday calendar) | **Unpaid leave & absence** feed proration directly (same module, same DbContext) |
| **A basic pay-run** — `PayRun`/`Payslip` + `RunPayroll` + `PostPayRun` (posts DR Salary Expense / CR Salary Payable via `IJournalPoster`), already **approvable** (`Accounting.RunPayroll`) | ~25% of Payroll already exists — we extend, not restart |
| **Accounting engine** (`IJournalPoster`, `AccountingSettings` with SalaryExpense/SalaryPayable accounts) | Salary/gratuity/pension journals post through the same engine — no Accounting reference |
| **Approval engine + amount thresholds** | "Payroll > AED X → CEO" is a rule, not code |
| **Multi-tenant + multi-company + consolidation** | Each company runs its own payroll; the CEO sees **consolidated** payroll cost |
| **Salary encryption + salary-visibility rules** | Pay data is sensitive; the controls already exist |

**Payroll stands on finished foundations — this is why it is the right next module.**

---

## 2. The UAE reality that shapes every decision

- **No personal income tax.** There is **no PAYE / income-tax withholding** on salaries in the UAE. No tax tables, no year-end tax filing. This removes the single most complex part of Western payroll.
- **WPS is mandatory.** Salaries are paid electronically and reported via a **SIF (Salary Information File)** submitted through a bank/exchange house to MoHRE + the Central Bank. Non-compliance → fines and visa/work-permit bans.
- **Gratuity / End-of-Service (EOSB)** replaces a pension for **expats** (the majority). Rule (Decree-Law 33/2021): **< 1 yr → none; 1–5 yrs → 21 days' *basic* per year; > 5 yrs → 30 days/year beyond 5**; **capped at 2 years' total wage**; on **basic** salary; unpaid-leave days excluded.
- **GPSSA pension** applies **only to UAE/GCC nationals** (a minority): employee + employer + government contributions, rates by emirate. Expats get gratuity instead. → the engine branches on **nationality**.
- **Basic vs allowances matters twice:** gratuity is on **basic only**, and WPS distinguishes **fixed vs variable** pay — so the salary structure must separate them.
- **Deductions are legally capped** (fines, loan-recovery limits); **absence/unpaid leave** reduces pay (computed from HR leave).

---

## 3. The one law everything obeys (the correctness spine)

> **`Gross = Basic + Σ Allowances` ; `Net = Gross − Σ Deductions`** — computed deterministically, enforced in code, reconciled three ways.

1. A **draft** run recomputes freely from its inputs (structure, days, leave, loans).
2. A **posted** run is **immutable** — corrections are a **reversal + re-run** (it produced journals + a WPS file).
3. **WPS net === payslip net === salary-journal net**, to the fils. This is the audit guarantee.
4. **Gratuity liability on the balance sheet = Σ accrued per employee.**
5. Net never goes below 0 — a loan installment that exceeds net **carries forward**.

---

## 4. Scope — what we build

Everything below is buildable on our current stack, reusing the engines Phase 1 + Phase 2 already delivered:

- Salary **structure & components** (basic + allowances + deductions; fixed / % of basic).
- Deterministic **payroll run engine** (gross → net, proration for join/leave, **unpaid leave from HR**).
- **Payslips** + **PDF** generation.
- **WPS SIF file** generation + download — the bank-ready SCR/EDR file to upload to the WPS portal.
- **Gratuity/EOSB** monthly accrual + end-of-service settlement calculator (UAE tiers).
- **GPSSA pension** for nationals — employee deduction + employer contribution + payable + report.
- **Loans / salary advances** with installment recovery.
- **Salary journals** (accrual, payment, gratuity provision, pension) via `IJournalPoster`.
- **Approval gate** on running/paying + **amount threshold** (reuse E9).
- **Payroll reports:** register, cost by department, bank-transfer list, gratuity-liability report.
- **Multi-company** payroll + **consolidated** payroll cost for the CEO; **multi-currency** employees.
- Overtime / one-off additions & deductions as **manual input lines** on a run.

The UAE statutory logic sits behind an `IStatutoryProvider` seam, so more countries can be added later — **UAE is implemented now.**

---

## 5. Feature catalog by layer

```
1. SETUP        Payroll settings (WPS employer IDs, pay day, rates) · Salary components catalog
                        │
2. MASTER DATA  Per-employee salary structure (effective-dated) · Loans / advances
                        │
3. RUN          Monthly Pay Run → compute payslips (proration + unpaid leave) → approve → post
                        │
4. ENGINE       ► DETERMINISTIC PAYROLL CALC ◄  (structure + days + leave + loans → gross→net)
                        │
5. COMPLIANCE   WPS SIF export · Gratuity accrual + settlement · GPSSA pension (nationals)
                        │
6. BOOKS        Salary/gratuity/pension journals via IJournalPoster → ledger + consolidation
                        │
7. REPORTS      Payroll register · Payslip PDF · Bank-transfer list · Gratuity liability · Cost by dept
                        │
8. CONTROLS     Approval + threshold · Immutable posted runs · Salary-visibility · Audit trail
```

---

## 6. Entities (the data model — all `CompanyEntity`, auto tenant/company isolation)

**Setup / master**
- **`PayrollSettings`** (one per company): WPS employer IDs (MOL/establishment ID, routing/bank code), pay day, base currency, toggles (accrue leave salary / air ticket), pension rates (per emirate), gratuity parameters, default GL accounts.
- **`SalaryComponent`** (catalog): Name, Type (Earning | Deduction), Calc (Fixed | %ofBasic), WPS-fixed flag, GL account.
- **`EmployeeSalaryStructure`** + **`SalaryStructureLine`**: per-employee package, **effective-dated** (raise history).
- **`EmployeeLoan` / `SalaryAdvance`** (+ installments): recovered as deductions across runs.

**Transactions**
- **`PayRun`** *(exists — extend)*: company, period, status (Draft → Approved → Posted → Paid), currency, totals, counts.
- **`Payslip`** *(exists — extend)* + **`PayslipLine`**: per-employee snapshot — basic, each earning/deduction line, days worked/absent/unpaid, gross, net, employer pension, gratuity accrued this period, bank/IBAN snapshot.
- **`GratuityAccrual`**: per-employee running EOSB liability (accrued / settled / balance) + settlement record on exit.
- **`WpsBatch`**: generated SIF record (period, SCR totals, record count, generatedAt) for audit + re-download.

---

## 7. The calculation engine (the heart — payroll's `JournalPoster`)

A single deterministic service; every payslip is reproducible from its inputs:

```
For each active employee in the period:
  periodDays, unpaidDays  ← HR leave + weekend/holiday calendar (already handled)
  prorate  = (periodDays − unpaidDays) / periodDays          # mid-month join/leave + unpaid leave
  basic    = structure.basic × prorate
  earnings = Σ component(Earning)  (fixed or % of basic)
  gross    = basic + earnings
  deductions = Σ component(Deduction) + loanInstallment + employeePension(if national) + fines
  net      = max(0, gross − deductions)                       # loan shortfall carries forward
  employerPension = (if national) rate × basic                # employer cost, not a deduction
  gratuityAccrued = (basic × 12 / 365) × (21 or 30) / 12      # monthly EOSB provision (expats)
  → Payslip + PayslipLines (+ update GratuityAccrual, loan balances)
Run totals = Σ payslips.
```
**No tax step (UAE).** The subtle parts are proration and the national-vs-expat branch — both use data we already own.

---

## 8. Compliance layer (the valuable part)

- **WPS SIF export.** Generate the fixed-format file: an **SCR** (Salary Control Record — employer IDs + total salaries + record count) and one **EDR** (Employee Detail Record) per payslip (person/labour-card ID, IBAN, fixed pay, variable pay, days, net, period). Downloadable, bank-ready; a `WpsBatch` is stored for re-download/audit. **Net in the SIF must equal payslip net.** The file is ready to upload to the WPS portal.
- **Gratuity engine.** Monthly **accrual** (provision) + a **settlement calculator** on exit applying the day-tiers, the 2-year-wage cap, and unpaid-leave exclusion; produces the settlement figure + its journal.
- **GPSSA pension (nationals).** Employee deduction + employer contribution + amount payable to GPSSA; rates configurable per emirate; produced as computation + a payable + a report.

---

## 9. How runs become books (via the engine — no Accounting reference)

```
Accrue run:   DR Salary Expense (basic + allowances, splittable by department)
              CR Salaries Payable (net)
              CR Loan Receivable  (installments recovered)
              CR Pension Payable  (employee portion — nationals)
              DR Pension Expense / CR Pension Payable (employer portion — nationals)
Gratuity:     DR Gratuity Expense / CR Gratuity Provision (monthly accrual)
Pay (WPS):    DR Salaries Payable / CR Bank
Settle EOSB:  DR Gratuity Provision / CR Bank (on exit)
```
Every line is a balanced journal, created automatically, immutable once posted (corrections are reversals). Salary expense can split **by department** (cost-centre) since HR owns departments. New `SystemAccount` roles: GratuityExpense/Provision, PensionExpense/Payable, LoanReceivable (resolved per company like the existing Salary accounts).

---

## 10. The report suite

| Report | Answers |
|---|---|
| **Payroll register** | Everyone's gross → deductions → net for the period |
| **Payslip (PDF)** | One employee's itemized pay |
| **Bank-transfer list / WPS file** | What to pay each person + the compliant SIF |
| **Gratuity liability** | Total end-of-service the company owes, per employee |
| **Payroll cost by department** | Management view of labour cost (reuses cost-centre split) |
| **Consolidated payroll cost** | CEO view across all companies (reuses Phase-2 consolidation) |

---

## 11. Placement — backend, frontend, activation

- **Backend:** inside **`Xorva.Modules.HR/Payroll/`** (feature-folders: Entities / Commands / Queries / Common). References **Core only**; posts to Accounting via `IJournalPoster`. Rationale: payroll is computation on **HR-owned** data (Employee, leave), and **modules never reference each other** — so it lives with its data. *(Precedent: PayRun/Payslip already in HR.)*
- **Activation:** **"Payroll" feature flag** (already in `ModuleCatalog`) — code in HR, endpoints + nav gate on the company having Payroll active.
- **Frontend:** a dedicated **"Payroll" nav group** (`payroll.api.ts`) — Salary Structure · Run Payroll · Payslips · WPS Export · Loans/Advances · Gratuity · Payroll Reports. Reuses the existing UI + chart kit.
- **Portability seam:** UAE statutory logic sits behind an `IStatutoryProvider` interface — UAE is implemented today, and the seam is ready for more countries later.

---

## 12. Controls & security

- **Approvals:** `Accounting.RunPayroll` already registered; add an optional **amount threshold** (reuse E9). Approval gates posting/paying, not draft calculation.
- **Immutability & audit:** posted runs locked; reversal + re-run for corrections; who ran/approved/paid recorded.
- **Sensitivity:** payroll pages gated to CompanyAdmin+ or an HR/Accounting-function Manager; salary-visibility rules already enforced; the run payload is encrypted in the approval flow.
- **Isolation:** per-company `PayrollSettings`, WPS IDs, and books; consolidated cost for the CEO only.

---

## 13. How we build it — order (usable early, complete at the end)

1. **Foundation** — `PayrollSettings` + `SalaryComponent` catalog + `EmployeeSalaryStructure`.
2. **Engine** — the deterministic calc service (gross→net, proration, unpaid-leave from HR); extend `RunPayroll` to use structures; payslips with lines.
3. **Books** — expand the salary journal (deductions / pension / gratuity split) + payment journal.
4. **Compliance** — **WPS SIF export**, then **gratuity** accrual + settlement, then **GPSSA pension** (nationals).
5. **Completeness** — loans/advances, payslip **PDF**, payroll reports, approval threshold, consolidated cost.

Each stage is demonstrable on its own; the module is **complete after stage 5**.

---

## 14. What's genuinely NEW vs. extend

- **Extend (small):** `PayRun` / `Payslip` / `RunPayroll` / `PostPayRun` (already exist).
- **New (the value):** salary structure + component catalog, the deterministic calc engine, **WPS SIF export**, **gratuity engine**, GPSSA pension, loans/advances, payslip PDF, payroll reports, `PayrollSettings`.

---

## 15. What I need to start

1. **Green-light the scope in §4.**
2. A short **design lock:** default salary components (basic + housing + transport), whether to accrue gratuity monthly (recommended) vs at exit only, pension rates per emirate, and the WPS employer IDs to put in `PayrollSettings`.
3. Then: build **foundation → engine → books → compliance → completeness**, inside `Xorva.Modules.HR`, posting through the existing engine — each stage tested and demoable.

**Approval request:** Proceed with the **complete UAE Payroll** system as scoped here — salary structures, the deterministic run engine, payslips, **WPS SIF export**, **gratuity accrual + settlement**, GPSSA pension, loans, salary journals, approvals, and payroll reports?
