# Xorva ERP — Complete Accounting System (Master Plan)

**Project:** Xorva ERP (Multi-Tenant Cloud ERP)
**Phase:** Phase 2 — Accounting (the financial core)
**Module:** `Xorva.Modules.Accounting` — module-owned entities, plugs into the existing Core
**Goal:** A **complete** accounting system (a real financial engine), **not** a set of data-entry forms
**References:** Wafeq, Zoho Books, QuickBooks, Odoo Accounting
**Compliance:** UAE mandatory e-invoicing (Federal Decree-Law No. 16 of 2024 — phased 2026, full B2B/B2G by 2027)
**Status:** For Lead Approval

> **Companion documents:** field-level detail in `ACCOUNTING_MODULE_SPECIFICATION.md`; step-by-step build instructions in `ACCOUNTING_BUILD_GUIDE.md`. **This document is the master scope.**

---

## 0. "Data entry" vs. COMPLETE accounting — the whole point

A lot of tools *look* like accounting but are really just **data-entry forms**: you type an invoice, it saves to a list. That is **not** accounting. **Complete accounting** is the *intelligence* on top of those forms — the engine, the reports, the compliance, the closing, and the controls that make the numbers **true and legal**.

| Just "data entry" (a form) | What makes it **COMPLETE accounting** |
|---|---|
| Type an invoice and save it | The invoice **auto-creates a balanced journal** (DR Receivable / CR Revenue / CR VAT) |
| A list of invoices | **Aged Receivables** — who owes what, by age, with overdue alerts |
| Record a payment | Payment **matched (allocated)** to invoices → receivable down, bank up |
| Enter an expense | Expense flows to the **P&L**; input VAT tracked for the **tax return** |
| — | **Trial Balance** proving every debit = every credit |
| — | **Profit & Loss, Balance Sheet, Cash Flow** — the real financial statements |
| — | **Period / year-end closing** — lock the books, roll profit to retained earnings |
| — | **VAT return** ready to file; **e-invoicing** compliance |
| — | **Audit trail** — nothing deleted, everything reversible, who-did-what recorded |
| — | **Multi-company consolidation** + **approval controls** on money |

**This document commits to the right-hand column** — the complete system. The forms are ~30% of the work; the engine, reports, compliance, and closing are the other ~70% and are what "complete accounting" means.

---

## 1. Phase 1 is the launch pad

The complete accounting system reuses everything Phase 1 already delivered and tested:

| Already built | Why Accounting needs it |
|---|---|
| **Multi-tenant + multi-company** | Each company gets its **own complete books**; the CEO gets **consolidated** statements. |
| **Dynamic Approval Engine** | *"Invoice > AED 50,000 → CEO"* is a rule, not code. Money actions gated instantly. |
| **RBAC (5 roles)** | Who can **post / void / close** vs. who only **reads reports** is enforceable. |
| **HR Module (salaries)** | Payroll becomes **salary journals** — a real module-to-accounting feed. |
| **Design system + charts** | Statements and the finance dashboard reuse the premium UI kit. |

---

## 2. The complete architecture — all seven layers

A complete accounting system is seven layers, each feeding the next:

```
1. SETUP        Chart of Accounts · Fiscal Years · Tax · Currencies · Opening balances
                        │
2. MASTER DATA  Customers · Suppliers · Products · Bank accounts
                        │
3. TRANSACTIONS Sales cycle · Purchase cycle · Banking · Manual journals
                        │
4. ENGINE       ► DOUBLE-ENTRY JOURNAL ENGINE ◄  (every event → balanced journal)
                        │
5. COMPLIANCE   VAT returns · E-invoicing · Audit trail · Period closing
                        │
6. REPORTS      Trial Balance · P&L · Balance Sheet · Cash Flow · Ledgers · Aging
                        │
7. CONTROLS     Approvals on money · Multi-company consolidation · Role permissions
```

**The engine (layer 4) is the heart.** Everything above it *feeds* it; everything below it *reads* it. This is what separates complete accounting from data entry.

---

## 3. The one law everything obeys: Double-Entry

> **Every transaction has two sides. Total Debits ALWAYS equal total Credits.** Enforced in code *and* the database. If they don't balance, the entry is **rejected**.

```
Customer pays AED 10,000:
  Bank (Asset)            DR 10,000
  Accounts Receivable                 CR 10,000
  ───────────────────────────────────────────
                          10,000      10,000   ✅
```

This guarantees the books are always correct — the foundation of every report.

---

## 4. Complete sub-module catalog (what, why, how connected)

The complete system is **16 sub-modules** across the seven layers. Nothing here is optional for "complete" — the split into stages (§8) is only about build *order*, not scope.

### Layer 1 — Setup
| # | Sub-module | Why it's needed |
|:--:|---|---|
| 1 | **Chart of Accounts** (+ industry templates) | The tree of every account; nothing records without it. Seeded from an **industry template** the company picks (see §4.1) — fully editable after. |
| 2 | **Fiscal Years & Periods** | Books close per month/year; you can't edit a closed period. |
| 3 | **Tax / VAT setup** | Rates (UAE 5%), input/output VAT accounts — drives every invoice/bill + the VAT return. |
| 4 | **Currencies** | Multi-currency invoices with FX gain/loss (complete systems handle more than one currency). |

### Layer 2 — Master data
| # | Sub-module | Why it's needed |
|:--:|---|---|
| 5 | **Contacts** (Customers & Suppliers) | Who invoices go *to* / bills come *from*; carries TRN for e-invoicing. |
| 6 | **Products / Items** | Reusable lines with default price, revenue account, tax — speeds and standardises entry. |
| 7 | **Bank Accounts** | Where cash actually sits; every payment moves through one. |

### Layer 3 — Transactions (the cycles)
| # | Sub-module | Why it's needed |
|:--:|---|---|
| 8 | **Sales cycle** — Quote → Invoice → Customer Payment → Credit Note → Recurring | The money-**in** cycle; the source of revenue and receivables. |
| 9 | **Purchase cycle** — PO → Bill → Supplier Payment → Debit Note → Expense | The money-**out** cycle; the source of expenses and payables. |
| 10 | **Banking** — deposits, withdrawals, transfers, **reconciliation** | Ties the books to the real bank statement — a complete system must reconcile. |
| 11 | **Manual Journals** | Adjustments, accruals, corrections the automated cycles don't cover. |

### Layer 4 — The engine
| # | Sub-module | Why it's needed |
|:--:|---|---|
| 12 | **Journal Engine** | Records, posts, voids, and **reverses** every entry; enforces the double-entry law. |

### Layer 5 — Compliance
| # | Sub-module | Why it's needed |
|:--:|---|---|
| 13 | **VAT / Tax returns** | Summarise output − input VAT into a filing figure for the FTA. |
| 14 | **E-invoicing** | Structured invoices (PINT AE/PEPPOL) via an accredited provider — legally required 2026/27. |

### Layer 6 — Reports
| # | Sub-module | Why it's needed |
|:--:|---|---|
| 15 | **Financial Reports** | Trial Balance, P&L, Balance Sheet, Cash Flow, General Ledger, Aged AR/AP, VAT report — the reason the whole module exists. |

### Layer 7 — Advanced completeness
| # | Sub-module | Why it's needed |
|:--:|---|---|
| 16 | **Fixed Assets & Depreciation** · **Period Closing** · **Cost centers/dimensions** (link to HR departments/projects) · **Budgets** | The features that make books audit-grade and management-grade, not just transactional. |

### 4.1 The Chart of Accounts — visual guide

#### What the "tree" actually looks like (the universal 5 categories)

Every business on earth uses the same 5 top-level categories. This structure is law:

```
💰 CHART OF ACCOUNTS (any company)
│
├── 🏦 ASSETS — things the company OWNS
│   ├── Current Assets
│   │   ├── 1000  Cash & Bank
│   │   ├── 1100  Accounts Receivable (customers owe us)
│   │   └── 1200  Inventory / Prepaid
│   └── Fixed Assets
│       ├── 1500  Equipment
│       └── 1600  Vehicles
│
├── 📋 LIABILITIES — things the company OWES
│   ├── Current Liabilities
│   │   ├── 2000  Accounts Payable (we owe suppliers)
│   │   ├── 2100  VAT Payable (owe the government)
│   │   └── 2200  Employee Payables
│   └── Long-Term Liabilities
│       └── 2500  Bank Loans
│
├── 🏛️ EQUITY — the owner's stake
│   ├── 3000  Owner's Capital
│   └── 3100  Retained Earnings
│
├── 💵 REVENUE — money the company EARNS
│   ├── 4000  (depends on business type — see below)
│   └── 4100  ...
│
└── 💸 EXPENSES — money the company SPENDS
    ├── 5000  (depends on business type — see below)
    ├── 5100  ...
    └── 5200  ...
```

The top-level structure (Assets, Liabilities, Equity) is **universal**. The accounts inside Revenue and Expenses **change depending on what the business does** — because different businesses earn and spend money differently.

#### How the tree differs by industry — four real examples

**🍕 Restaurant / Food & Beverage**
```
💵 REVENUE                              💸 EXPENSES
├── 4000  Food Sales                    ├── 5000  Food Cost (ingredients)
├── 4010  Beverage Sales                ├── 5010  Kitchen Staff Wages
├── 4020  Delivery Revenue              ├── 5020  Delivery Costs
└── 4030  Catering Revenue              ├── 5030  Restaurant Rent
                                        └── 5040  Utilities (gas, electricity)
🏦 ASSETS (unique)
├── 1200  Food Inventory                📋 LIABILITIES (unique)
└── 1300  Kitchen Equipment             └── 2300  Supplier Payables (food)
```

**💻 Software / IT Services**
```
💵 REVENUE                              💸 EXPENSES
├── 4000  Subscription Revenue          ├── 5000  Developer Salaries
├── 4010  License Sales                 ├── 5010  Cloud Hosting (AWS/Azure)
├── 4020  Consulting / Support          ├── 5020  Software Licenses
└── 4030  Custom Development            ├── 5030  Office Rent
                                        └── 5040  Marketing & Ads
🏦 ASSETS (unique)
├── 1200  Prepaid Hosting
└── 1300  Computer Equipment
```

**👷 Manpower / Staffing (e.g. RightSource)**
```
💵 REVENUE                              💸 EXPENSES
├── 4000  Staffing Fees                 ├── 5000  Contractor / Worker Wages
├── 4010  Placement Commission          ├── 5010  Visa & Immigration Costs
├── 4020  Outsourcing Revenue           ├── 5020  Worker Accommodation
└── 4030  Recruitment Fees              ├── 5030  Medical Insurance (workers)
                                        ├── 5040  End-of-Service Gratuity
                                        └── 5050  Recruitment & Advertising
📋 LIABILITIES (unique)
├── 2200  Worker Wages Payable
└── 2300  Gratuity Provision
```

**🏪 Trading / Wholesale**
```
💵 REVENUE                              💸 EXPENSES
├── 4000  Product Sales                 ├── 5000  Cost of Goods Sold (COGS)
├── 4010  Wholesale Revenue             ├── 5010  Shipping & Freight
└── 4020  Export Sales                  ├── 5020  Warehouse Rent
                                        ├── 5030  Customs & Import Duties
                                        └── 5040  Staff Salaries
🏦 ASSETS (unique)
├── 1200  Product Inventory
├── 1210  Goods in Transit
└── 1300  Delivery Vehicles
```

> **The pattern:** the 5 categories are always the same. Only the account names and numbers inside Revenue, Expenses, and some specialised Asset/Liability accounts change — because that's what makes each business different.

#### Why EVERYTHING ELSE is identical regardless of business type

| Component | Same or different? | Why |
|-----------|--------------------|-----|
| Chart of Accounts (the tree) | **DIFFERENT** per business | Different revenue sources, cost types |
| Journal Engine (double-entry) | **SAME** | Debit = Credit is universal law |
| Invoices, Bills, Payments | **SAME** | Every business invoices and pays |
| P&L report | **SAME** | Always = Sum(Revenue accounts) − Sum(Expense accounts) |
| Balance Sheet | **SAME** | Always = Assets = Liabilities + Equity |
| Trial Balance, Cash Flow | **SAME** | Built from the same journal data |
| VAT / e-invoicing | **SAME** | UAE law applies to every business equally |

The P&L engine does **not care** if the revenue account is called "Food Sales" or "Staffing Fees" — it sums all accounts of type `Revenue` and subtracts all accounts of type `Expense`. The intelligence is universal; templates are just seed data.

#### The template onboarding flow in Xorva

```
┌───────────────────────────────────────────────────────┐
│  Company activates Accounting module                  │
│                                                       │
│  Step 1:  "What type of business is this company?"    │
│                                                       │
│     ○ Restaurant / Food & Beverage                    │
│     ○ Software / IT Services                          │
│     ○ Manpower / Staffing / Recruitment               │
│     ○ Trading / Wholesale / Retail                    │
│     ○ Construction / Contracting                      │
│     ○ Consulting / Professional Services              │
│     ○ General (standard template)                     │
│                                                       │
│  Step 2:  System seeds ~30–40 matching accounts       │
│           (rows in the Account table, CompanyId-scoped)│
│                                                       │
│  Step 3:  Company Admin can:                          │
│           ✏️  Rename any account                       │
│           ➕  Add new accounts                         │
│           🚫  Deactivate unused accounts               │
│           📁  Create sub-accounts (1000 → 1001, 1002) │
│                                                       │
│  The template is a starting point, never a cage.      │
└───────────────────────────────────────────────────────┘
```

#### Multi-company: different templates, one consolidated view (Xorva's edge)

```
Tenant: RightSource Group                     CEO Dashboard
│                                              ┌─────────────────────────────┐
├── Company: RightSource Manpower              │  Consolidated P&L           │
│   Template: "Manpower/Staffing"              │  ───────────────────────    │
│   └── CoA: Staffing Fees, Contractor         │  Revenue:   AED 850,000    │
│            Wages, Visa Costs …               │  Expenses:  AED 620,000    │
│                                              │  Net Profit: AED 230,000   │
├── Company: RightSource IT                    │                             │
│   Template: "Software/IT"                    │  By company:                │
│   └── CoA: Subscription Revenue, Cloud       │  ├─ Manpower   +120,000    │
│            Hosting, Dev Salaries …           │  ├─ IT          +65,000    │
│                                              │  └─ Trading     +45,000    │
└── Company: RightSource Trading               └─────────────────────────────┘
    Template: "Trading/Wholesale"
    └── CoA: Product Sales, COGS,
             Shipping, Inventory …

Each company has its OWN Chart of Accounts from its OWN template.
The CEO sees consolidated figures across ALL companies.
Each CompanyAdmin sees ONLY their company's books.
Wafeq (single-company) cannot do any of this.
```

---

## 5. Entities (the complete data model)

Every entity extends `CompanyEntity` → automatic multi-tenant + per-company isolation (same as HR). ~18 entities:

**Setup:** `Account` · `FiscalYear` · `FiscalPeriod` · `TaxRate` · `Currency`
**Master:** `Contact` · `Product` · `BankAccount`
**Sales:** `Invoice` + `InvoiceLine` · `CustomerPayment` + `PaymentAllocation` · `CreditNote`
**Purchases:** `Bill` + `BillLine` · `SupplierPayment` · `DebitNote`
**Engine:** `JournalEntry` + `JournalLine`
**Advanced:** `FixedAsset` + `DepreciationSchedule`

Each transactional entity carries a `JournalEntryId` — its link to the double-entry record it generated. Chart-of-Accounts **industry templates** (§4.1) are seed data (defined per industry) applied when a company activates Accounting — they create the initial `Account` rows, which the company then edits freely. *(Field-level detail: `ACCOUNTING_MODULE_SPECIFICATION.md`.)*

---

## 6. How documents become books — the intelligence layer

The user works with **documents**; the system writes the **accounting**. This automation is the difference between "complete" and "data entry":

```
POST Invoice (10,000 + 5% VAT):     DR Receivable 10,500 / CR Revenue 10,000 / CR VAT 500
POST Bill (2,000 + 5% VAT):         DR Expense 2,000 / DR VAT 100 / CR Payable 2,100
RECEIVE Customer Payment (10,500):  DR Bank 10,500 / CR Receivable 10,500
PAY Supplier (2,100):               DR Payable 2,100 / CR Bank 2,100
PAYROLL (from HR):                  DR Salaries 15,000 / CR Bank 13,500 / CR Tax 1,500
YEAR-END CLOSE:                     move all Revenue & Expense → Retained Earnings
```

Every line is a **balanced journal**, created automatically, immutable once posted (corrections are **reversals**, never edits). The reports in §7 are simply different views of these journals.

---

## 7. The complete report suite (the real output)

| Report | Answers | Layer it proves |
|---|---|---|
| **Trial Balance** | Do all debits = all credits? | the engine is sound |
| **Profit & Loss** | Are we profitable? (Revenue − Expenses) | performance |
| **Balance Sheet** | What we own vs. owe (Assets = Liabilities + Equity) | financial position |
| **Cash Flow** | Where cash actually moved | liquidity |
| **General Ledger** | Every transaction inside one account | drill-down / audit |
| **Aged Receivables / Payables** | Who owes us / we owe, by age | collections / payables |
| **VAT Return** | What to file with the FTA | tax compliance |
| **Customer / Supplier Statement** | One contact's full history | reconciliation with partners |

Plus a **finance dashboard**: P&L trend, cash position, overdue invoices/bills — reusing the existing chart kit.

---

## 8. What makes it "complete" — the checklist

A system is only **complete accounting** when it can do **all** of these (not just record documents):

- ✅ **Auto-journals** — every document produces correct double-entry
- ✅ **Balanced & enforced** — debits = credits, always
- ✅ **Immutable + audit trail** — post/void/reverse, who-did-what, nothing lost
- ✅ **Period & year-end closing** — lock months, roll profit to retained earnings
- ✅ **Full statements** — Trial Balance, P&L, Balance Sheet, Cash Flow
- ✅ **Aging & collections** — Aged AR/AP
- ✅ **Tax** — VAT on documents + a filable VAT return
- ✅ **Bank reconciliation** — books match the real bank statement
- ✅ **Multi-currency** — invoice in any currency, FX handled
- ✅ **E-invoicing** — structured, compliant, provider-ready
- ✅ **Fixed assets** — capitalise + depreciate over time
- ✅ **Controls** — approvals on money, role permissions, multi-company consolidation

Every item above is in scope for this module.

---

## 9. How it connects — Phase 1 and future modules

```
   HR (built) ─payroll→┐
   SALES ─invoice/receipt→┤
   PURCHASES ─bill/payment→┼──→  JOURNAL ENGINE  ──→  FINANCIAL STATEMENTS
   BANKING ─reconcile→┤            │
   INVENTORY (future) ─COGS→┤       └──→ VAT return · e-invoicing (ASP → FTA)
   FIXED ASSETS ─depreciation→┘
```

- **Multi-company:** each company's complete books are isolated; the CEO consolidates.
- **Approvals:** invoices, bills, payments, journals, voids all register as approvable actions — zero new approval code.
- **HR → Accounting:** payroll feeds salary journals (built first for exactly this).
- **Future modules** (Inventory, more Payroll) plug into the same engine the same way.

---

## 10. How we build it — order (foundation → complete)

Built by dependency, so the system is **usable early and complete at the end**:

1. **Foundation** — Chart of Accounts → Journal Engine → Fiscal Years → Tax → Currencies.
2. **Core cycle** — Contacts → Products → Sales (Invoice → Payment) → Purchases (Bill → Payment) → Bank.
3. **Statements** — Trial Balance → P&L → Balance Sheet → Cash Flow → Ledgers → Aging → dashboard.
4. **Compliance** — VAT return + e-invoicing-ready invoices.
5. **Completeness** — Credit/Debit notes → Bank reconciliation → Period/year closing → Fixed assets → Recurring → Multi-currency.

Each stage is demonstrable on its own, so progress is visible at every weekly check-in, and the module is **fully complete** by the end of stage 5.

### Why this is real engineering 
Correctness is the law: debits must equal credits, statements must reconcile to the cent, posted entries are immutable, closed periods are locked, VAT and e-invoicing must match government rules, and the CEO's consolidation must roll up exactly. This is the part ERP vendors charge the most for — and why it is built carefully and tested, not rushed.

---

## 11. What I need to start

1. **Green-light the complete scope** (§4 — the 16 sub-modules, built in the order of §10).
2. A short **design lock** (as with HR): default Chart-of-Accounts seed, document numbering, default currency, and which money actions are approvable.
3. Then: scaffold `Xorva.Modules.Accounting`, wire it to Core, and build **foundation → cycles → statements → compliance → completeness**.

**Approval request:** Proceed with the **complete** Accounting system as scoped here — the double-entry engine, full sales & purchase cycles, complete financial statements, VAT + e-invoicing compliance, reconciliation, closing, and fixed assets?
