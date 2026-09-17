# Manpower Client — Full Context (for Xorva SaaS)

> **Purpose:** Permanent reference for the manpower-supply lead so every future
> discussion starts from here. Captures the business, the mental model, the exact
> Xorva mapping, the real documents, and what's built vs. to-build.
> **Client (lead):** Gulf Oasis Manpower Supply – Sole Proprietorship L.L.C. (Abu Dhabi, UAE)
> **Vertical:** Manpower / labour outsourcing (distinct from the Tadbeer domestic-worker vertical)
> **Date:** 2026-07-29

---

## 1. The business in one paragraph

Gulf Oasis has ~**180 workers** (Helpers, Masons, Labour…). It **supplies** them to
**client companies** (Bauer, Jihua Royal, Darkglobe, KEZAD…) under **agreements**. The
client pays Gulf Oasis per the agreement (rate × time worked, from a **timesheet**),
on the agreement's payment term (**30 days, 10 days, etc.**). Gulf Oasis pays each
worker a **monthly salary** — split into **WPS** (basic, via bank) and **Non-WPS**
(overtime, leave, absence, sick, extra work). A worker can move between clients/sites
during a month (e.g. 14 days here, rest there).

---

## 2. The mental model (the crux)

```
   NORMAL TRADING CO.                THIS MANPOWER CO.
   ─────────────────                 ──────────────────────────────
   Purchase   → money OUT            Payroll (salary to 180)  → money OUT
   Stock/Product                     The 180 workers ARE the product
   Sell/Invoice → money IN           Invoice client per agreement → money IN
   Margin = sell − buy               Margin = invoices − salaries
```

- **There is NO "purchase" module here.** The money-out side is **payroll**.
- **The workers are a reusable resource** — supplied to client after client, tracked
  by a **Labour Board** (free vs engaged, where, until when).
- **The timesheet is the single source of truth** feeding BOTH sides: it drives the
  **invoice** (money in) AND the **payroll** (money out).

### 2b. Two kinds of people — do NOT mix them

Gulf Oasis has **two distinct groups of people**:

| | Office Employees (real staff) | Manpower Workers (the product) |
|---|---|---|
| Who | HR, accountants, managers, admin | The 180 supplied to clients |
| Role | Run the company (internal) | The **product** that's sold/rented |
| In Xorva | **HR module → Employee** (built ✓) | **Manpower pack → Worker** (new entity) |
| Billed to a client? | No | Yes → generates invoice revenue |
| On Labour Board / deployed? | No | Yes (free/engaged, to sites) |
| Payroll | Normal salary | WPS + Non-WPS (attendance-driven) |
| Custom fields | Standard HR | MOL ID, category, WPS bank, passport, visa |
| Accounting | **Overhead** (admin cost) | **Direct cost** of the service → margin = invoice − worker salary |

Both are the same **"Person" primitive** but **two different entity types** (office staff =
built-in HR; workers = Manpower pack). Same engine, two configs — no code fork. Keep them
separate: worker salary is a **direct cost** matched to revenue; office salary is **overhead**.

---

## 3. Mapping to Xorva ERP concepts

| Business object | Xorva concept | Status in Xorva |
|---|---|---|
| The 180 workers ("product") | **Resource / Employee** + custom fields | Employee exists ✓; custom fields = to build |
| Worker documents (passport, MOL ID, WPS bank, visa, nationality, contract salary) | **Custom fields** on the worker | To build (dynamic engine) |
| Client companies (Bauer, Jihua, Darkglobe, KEZAD) | **Customer / Contact** | Exists ✓ |
| Agreement (rate card per category, OT rules, payment term, duration) | **Document type: Agreement** + rate card | To build (pack) |
| Client order | **Document type: LPO / Order** | To build (pack) |
| Which worker at which client/site + dates | **Deployment / Assignment** → **Labour Board** | To build (pack) |
| Monthly attendance per worker per site | **Timesheet / Attendance** (canonical) | To build (the core piece) |
| Supply billed to client ("sell") | **Sales → Invoice** (money IN), due per agreement term | Invoicing exists ✓; rate-calc = to build |
| Salary to the 180 ("instead of purchase") | **Payroll** (money OUT): WPS basic + Non-WPS | Payroll base exists ✓; WPS split = to build |
| Profit per worker / contract | **Margin report** (invoices − salaries) | To build |
| Ledger postings for both sides | **Accounting** | Exists ✓ |

---

## 3b. Manpower = a PACK of config on the dynamic engine (NOT manpower code)

**This is the whole point — everything above is CONFIGURATION on the ONE universal Xorva
engine, not a custom manpower app.** Each need maps to a universal primitive:

| Manpower need | Universal primitive | Built as | Config / Code |
|---|---|---|---|
| Office employees | *(built-in HR)* | switch on HR module | Config (toggle) |
| Workers (180 = product) | **Resource** | `EntityDefinition: Worker` + custom fields | Config (pack) |
| Client companies | **Party** | built-in Contact | Config |
| Agreement + rates | **Document + Rule** | `DocumentType: Agreement` + rate table | Config (pack) |
| LPO / order | **Document** | `DocumentType: LPO` | Config |
| Deployment | **Event** | `EntityDefinition: Deployment` + status Free/Engaged | Config |
| Labour Board | **View** | board over Deployment status | Config |
| Timesheet | **Event** | `EntityDefinition: Timesheet` + attach + lock | Config + AI/import helper |
| Invoice (money in) | **Document → Posting** | built-in Invoice + rate-calc | Config + calc plugin |
| Payroll WPS/Non-WPS (money out) | **Posting** | built-in Payroll + WPS split | Config + calc plugin |
| Labels | **Config cascade** | label overrides per company | Config |

≈90% config (pack rows), ≈10% code — and that code (rate-calc, WPS split) is a **reusable
engine plugin**, not manpower-only. The **Manpower pack** = a bundle of `EntityDefinition` +
`FieldDefinition` + `DocumentType` + labels + rules, written to ONE company, scoped by
`CompanyId`. **Same engine renders Tadbeer and Manpower — no fork.** Rule to hold: we deliver
this client as **engine + config**, never as a manpower app. See `docs/SAAS_ARCHITECTURE_DESIGN.md`.

---

## 4. The whole scenario (end to end)

### A. Setup (once)
1. Load the **180 workers** as the resource — with documents (passport, MOL ID, WPS
   bank, category, contract salary).
2. Load **client companies** as customers.
3. Load **agreements**: rate card per worker category, OT rules
   (normal ×1.25 / Sunday ×1.50 / holiday ×2.50, Ramadan 6h = 8h), **payment term
   (30/10 days)**, duration.

### B. Monthly operating loop (per client)
1. **Order (LPO)** arrives — e.g. Bauer: *4 Helpers, 3 months, Ruwais*.
2. **Check the Labour Board** → filter **Free** Helpers → who's available now.
3. **Deploy** free workers to the client/site + dates → status flips **Free ▶ Engaged**.
4. **Daily attendance** marked at the site (present / absent / OT).
5. **Month-end timesheet — one click:** generate Xorva's canonical sheet → **import or
   AI-read the client's timesheet** (each client's format differs) → **reconcile /
   correct to match the client** → attach client's sheet as proof → **Lock**.
6. **Money IN — Invoice the client:** rate × timesheet + OT + 5% VAT; **due date set by
   the agreement term (30/10 days)**; tracked in aged receivables. Posts to ledger.
7. **Money OUT — Payroll (all 180):** each worker = **WPS basic** (bank file) +
   **Non-WPS** (OT + food + incentive − deductions, with reasons). Posts salary journals.
8. **Margin** = invoices − salaries, per worker/contract.

### C. Ongoing
- **Labour Board** always shows free/engaged/where → deploy idle labour fast
  (idle worker = salary paid, nothing earned).
- **Receivables** tracked per agreement term (who owes, when due).
- **Reports:** monthly report, margin, WPS/Non-WPS files.

---

## 5. The timesheet (the #1 headache) — the approach

- Clients send timesheets in **different formats** (KEZAD = scanned paper; Jihua = weekly
  day-grid with codes; others in Excel).
- **Xorva owns ONE canonical timesheet** (the source of truth).
- Client timesheets are for **reconciliation + proof**, not re-keying: import Excel
  (per-client mapping) · **AI reads scanned sheets and proposes → human approves** ·
  attach the client's file · flag mismatches · correct · **Lock**.
- **Do NOT promise** auto-reading every scanned format perfectly. AI proposes; a human
  approves; **deterministic code does the money.**

---

## 6. Salary: WPS vs Non-WPS (from the client's real sheets)

Both sheets share the same columns:
`days · Abs · pres · Basic Salary · WPS OT · NON-WPS OT · Sunday OT · food days/allow ·
Incentive · Addition · Deduction · WPS basic · NON-WPS · Total`.

- **WPS** = basic salary paid via bank (UAE Wage Protection System, mandatory).
- **Non-WPS** = overtime, food allowance, incentives, additions − deductions (leave,
  absence, sick, extra work all count here).
- Both are **driven by the locked timesheet**.

---

## 7. The client's real documents (what each is)

| File | What it is |
|---|---|
| `signed agreement-2025 to 2027.pdf` | Master agreement (scanned) |
| `Blanket Agreement 10031 - 2026 - 28.pdf` | Blanket agreement terms (has text) |
| `LPO - Latest - Valid until June 2026.pdf` | Bauer purchase order — 4 Helpers, `10h × 10.5 AED × 26 = 2,730/mo`, 3 months = 32,760 + 5% VAT = **34,398 AED**; OT ×1.25/×1.50/×2.50; 60-day payment term |
| `01.KEZAD A-2000 T & A SHEET MAY-2026.pdf` | KEZAD timesheet (scanned — proves the format problem) |
| `Jihua royal.xlsx` | Jihua timesheet — weekly day-grid (MO/TUE/…, codes H, /) |
| `Bauer Kizad -Inv - June 2026.pdf` / `Darkglobe - Inv - June 2026.pdf` | Invoices to clients (scanned) |
| `WPS FOR JUNE 2026.xlsx` | WPS salary file (columns above) |
| `NON-WPS JUNE 2026 - EMPLOYEES SALARY DETAILS.xlsx` | Non-WPS salary detail |
| `Monthly Report - June 2026.xlsx` | Worker→site deployment + remarks (site codes G72, C019…) |

---

## 8. What Xorva has vs. needs (honest)

**Already built & reusable:** multi-company, chart of accounts + ledger, invoicing +
aged receivables (handles the 30/10-day terms), payroll base, approvals, contacts,
employees. ✓

**To build (the Manpower pack + engine bits):** worker custom fields, Agreement +
rate-card, LPO, Deployment + **Labour Board**, **canonical timesheet**, timesheet→invoice
rate-calc, **WPS/Non-WPS split + WPS file export**, margin report.

**Honesty:** heavier than Tadbeer because the timesheet→invoice and timesheet→payroll
**calculations are real logic** (≈70% config / 30% code). One engine, one pack — but
budget for the calc + WPS file.

---

## 9. Delivery phases (what to promise the lead)

- **Phase 1 (deal-winner):** worker registry + agreement/rates + canonical timesheet →
  **auto Invoice + WPS/Non-WPS payroll** for ONE customer (Bauer), end to end.
- **Phase 2:** Excel import per client format, deployment splitting across sites,
  Labour Board, margin + monthly reports.
- **Phase 3:** AI timesheet reading for scanned sheets, all customers, exceptions.

**Do NOT promise:** instant/off-the-shelf fit, auto-reading every scanned timesheet, or
"AI does it all." Every ERP delivers this vertical as an **implementation project**.

---

## 10. Open questions for the client (to finalize the pack)

1. Payment terms actually in use (30 / 10 / 60 days?) and per-agreement or per-client?
2. Does Xorva need to generate the **official WPS SIF bank file**, or just the breakdown?
3. Who **approves** a timesheet before invoicing — Gulf Oasis staff, or the client signs?
4. Rates **per worker category** only, or per individual worker/contract?
5. Biggest pain to solve first — **timesheet chase**, **invoicing**, or **WPS/Non-WPS payroll**?

---

## 11. Related material in this repo
- Business-flow visual: `docs/manpower-scenario.html`
- Operating-process + Labour Board visual: `docs/labour-operating-process.html`
- Architecture-safety visual: `docs/onboarding-architecture.html`
- Platform architecture & roadmap: `docs/SAAS_ARCHITECTURE_DESIGN.md`

*This vertical is a test case that validates Xorva's universal engine — same primitives
as Tadbeer, different config. It is not a separate app.*
