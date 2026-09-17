# Xorva ERP — Accounting Module: Build Guide (Final)

**Companion docs:** `ACCOUNTING_MODULE_COMPLETE.md` (full scope) · `ACCOUNTING_MODULE_SPECIFICATION.md` (field-level detail).
**This doc is the single source of truth for building it** — the decisions we locked, then **one** step-by-step build (backend → frontend → tests). Mirrors the proven HR-module architecture.

---

# PART 1 — What we agreed (locked)

## 1. Architecture decisions

- **ONE module project, feature-foldered.** `Xorva.Modules.Accounting`, organised by sub-module folder (Ledger / Sales / Purchases / Tax / Contacts / Banking / Assets / Reports) — **not** separate projects per sub-module. It's one bounded context sharing the Journal Engine + Chart of Accounts. If ever extracted to a microservice, the *whole* module goes, never a single screen. (Same rationale ABP / eShopOnWeb / Odoo `account` use.)
- **Module references only Core + MediatR + FluentValidation.** Never Infrastructure. Persistence is via `IXorvaDbContext` (`Set<T>()` + `SaveChangesAsync`) — the same abstraction HR uses.
- **Every entity extends `CompanyEntity`** → automatic tenant + per-company isolation (free, already tested).
- **CQRS via MediatR**; **FluentValidation** validators run before handlers; the existing **approval engine** intercepts money actions with zero new approval code.
- **Payroll lives in HR, not Accounting.** It's about employees. At payout HR posts the salary journal into Accounting through a **Core interface `IJournalPoster`** (same inversion-of-dependency pattern as `IUserProvisioningService`). Accounting never references HR.
- **Module-per-company + role-based.** Accounting appears only when the active company activated it; every screen is role-gated (§4 role matrix). Each company keeps its **own** CoA, `AccountingSettings`, fiscal year, tax rates and books (all `CompanyEntity`); `SetupAccounting` runs **per company** on activation. A **CEO** (cross-company access) gets a **consolidated** view across all companies in the tenant; everyone else is scoped to their own company.
- **Approvals + amount thresholds.** Money actions are approvable via the existing engine; an optional `AmountThreshold` on the rule (+ the action exposing its amount) lets "invoice > AED 50,000 → CEO" work. **Approval attaches to the command that commits money to the books (the *posting*), never to draft creation** — the draft is saved freely; posting sits in Pending until approved, then the journal is created on replay (via the existing deferred-replay path). Registered actions (each on the command that actually commits the journal): `Accounting.PostInvoice`, `.RecordPayment`, `.PostBill`, `.ManualJournal` *(CreateManualJournal posts immediately — no draft)*, `.VoidTransaction`, `.RunPayroll`.

## 2. Correctness laws (non-negotiable)

- **Debits = credits — enforced in the `JournalPoster` (application code).** Backed by the DB checks a constraint *can* actually do: per-line `CHECK (debit >= 0 AND credit >= 0 AND NOT (debit > 0 AND credit > 0))` and per-header `CHECK (TotalDebit = TotalCredit)`. *(A `CHECK` cannot sum across the many lines of an entry — that needs a trigger, only if ever required.)*
- **Posted entries are immutable.** Corrections happen by a **reversing** journal (void → reversal), never by edit or delete.
- **Closed periods reject new entries** (`PeriodGuard`).
- **Atomicity.** A document and its journal commit in **one transaction / unit of work** — never an invoice without its journal, or vice versa. If posting throws, the whole write rolls back.
- **Reports read the source of truth (posted `JournalLine` rows), not a cached field.** `Account.CurrentBalance` is only a denormalised cache; Trial Balance, P&L, and Balance Sheet are computed from the lines so they can never drift.

## 3. Build defaults (locked)

| # | Decision | Locked value |
|---|---|---|
| 1 | Base currency | **AED** (multi-currency deferred to Stage E) |
| 2 | VAT rates | **5% Standard · 0% Zero-rated · Exempt** |
| 3 | Numbering | **`INV-2026-0001` · `BILL-2026-0001` · `JV-2026-0001`** — prefix + fiscal year + zero-padded counter, per company |
| 4 | CoA templates (day one) | **General · Trading · Construction · Staffing · Software** (~30–40 accounts each) |
| 5 | Approvals on money | **OFF by default** — actions *registered* as approvable, but nothing is gated until an admin adds a rule; amount thresholds arrive in Stage E |
| 6 | Role gate (until Stage E) | **Company Admin & above**; the department-function upgrade lands in Stage E |

## 4. Access & role model — department-function-driven (locked)

**The decision:** a **Manager heads a department**, and the **department's *function* decides which module that manager runs.** An Accounting-department manager *is* the accountant; an HR-department manager runs HR; a Sales-department manager runs Sales. **One `Manager` role, function-driven — no separate `Accountant` role, no role explosion.** (This is how Odoo/SAP/NetSuite model access — it follows function, not a rigid ladder.)

**How it works:**
- `Department` gains a **`Function`** enum: `General · HR · Accounting · Sales · Operations · …`.
- A Manager's module access = the function of the department they head.
  - Accounting-dept manager → full accounting for the **company's** books (books are company-wide — one CoA per company; per-department profit = the Cost-Centres feature, advanced).
  - HR-dept manager → their team + leave approvals (today's behaviour).
- **CEO & Company Admin** = everything; **Employee** = self-service only.

**Prerequisites (built as one feature in Stage E):**
1. `Department.Function` field (+ migration).
2. The manager's **`DepartmentId` + department `Function` in the login JWT / `ICurrentTenantService`** — *currently `DepartmentId` is NOT in the token.* This is the key prerequisite.
3. Permission gates read it: a Manager passes an Accounting gate **iff** they head a department whose Function == Accounting. Each gate changes from `role <= CompanyAdmin` to `role <= CompanyAdmin || managesFunction(Accounting)` — a one-line extension. Until then, the engine ships gated at "Company Admin & above."

**Role matrix (who can do what):**

| Capability | CEO | Company Admin | Manager *(heads Accounting dept)* | Manager *(other dept)* | Employee |
|---|:--:|:--:|:--:|:--:|:--:|
| View reports / dashboard | ✅ all companies | ✅ own company | ✅ own company | ❌ | ❌ |
| Create/post invoices, bills, payments, journals | ✅ | ✅ | ✅ | ❌ | ❌ |
| Void / reverse | ✅ | ✅ | ✅ | ❌ | ❌ |
| Manage CoA, tax, settings | ✅ | ✅ | ✅ | ❌ | ❌ |
| Period / year-end close | ✅ | ✅ | ✅ | ❌ | ❌ |
| Set approval rules | ✅ (+mandatory) | ✅ own company | ❌ | ❌ | ❌ |
| Submit expense claim (future) | ✅ | ✅ | ✅ | ✅ | ✅ |

---

# PART 2 — The blueprint (structure, engine, entities)

## 5. Folder structure (create exactly this)

**Feature-foldered:** each sub-module owns its own `Entities/ Commands/ Queries/`. Cross-cutting pieces (Enums, the engine in `Common/`, DTOs, Extensions) stay at the module root. A new sub-module is a new folder — nothing else moves.

```
backend/Modules/Xorva.Modules.Accounting/
├── Xorva.Modules.Accounting.csproj         # refs: Xorva.Core, MediatR, FluentValidation
│
├── Enums/                                   # shared across sub-modules
│   ├── AccountType.cs                       # Asset, Liability, Equity, Revenue, Expense
│   ├── AccountSubType.cs                    # Bank, Receivable, Payable, Tax, COGS, …
│   ├── NormalBalance.cs                     # Debit | Credit
│   ├── JournalStatus.cs                     # Draft, Posted, Voided
│   ├── JournalSourceType.cs                 # Manual, Invoice, Bill, Payment, Payroll, Opening, Fx, Depreciation
│   ├── DocumentStatus.cs                    # Draft, Posted, PartiallyPaid, Paid, Voided
│   ├── ContactType.cs · PaymentDirection.cs · PaymentMethod.cs · TaxAppliesTo.cs
│
├── Common/                                  # the engine — shared by every sub-module
│   ├── AccountingGuard.cs                   # ResolveCompanyId + EnsureModuleActive (like HrGuard)
│   ├── JournalPoster.cs                     # ★ THE ENGINE (implements Core IJournalPoster)
│   ├── AccountResolver.cs                   # ★ resolve system accounts (AR, AP, Bank, Sales, VAT…)
│   ├── NumberSequence.cs                    # ★ next INV-/BILL-/JV- per company (unique + retry)
│   ├── ChartTemplates.cs                    # ★ industry CoA seed sets
│   ├── PeriodGuard.cs                       # reject posting into closed periods
│   └── Mappers.cs                           # ToDto extensions
│
├── Ledger/                                  # ── the core ──
│   ├── Entities/   Account · AccountingSettings · FiscalYear · FiscalPeriod
│   │              · JournalEntry · JournalLine            # ★ the heart
│   ├── Commands/   SeedChartOfAccounts/ · CreateAccount/ · UpdateAccount/ · DeactivateAccount/
│   │              · SetupAccounting/   (fiscal year + settings + defaults + tax on activation)
│   │              · CreateFiscalYear/ · ClosePeriod/ · CloseYear/
│   │              · CreateManualJournal/ · VoidJournal/ · PostOpeningBalances/
│   └── Queries/    ListAccounts/ (flat + tree) · GetTrialBalance/ · ListJournals/ · GetJournal/
│
├── Tax/
│   ├── Entities/   TaxRate
│   ├── Commands/   SeedTaxRates/ · CreateTaxRate/
│   └── Queries/    GetVatReturn/
│
├── Contacts/
│   ├── Entities/   Contact
│   ├── Commands/   CreateContact/ · UpdateContact/
│   └── Queries/    ListContacts/ · GetContact/
│
├── Sales/
│   ├── Entities/   Invoice · InvoiceLine · CustomerPayment · PaymentAllocation · CreditNote · Product
│   ├── Commands/   CreateInvoice/ · PostInvoice/ · VoidInvoice/ · RecordCustomerPayment/
│   │              · CreateCreditNote/ · CreateProduct/
│   └── Queries/    ListInvoices/ · GetInvoice/ · GetAgedReceivables/
│
├── Purchases/
│   ├── Entities/   Bill · BillLine · SupplierPayment · DebitNote
│   ├── Commands/   CreateBill/ · PostBill/ · VoidBill/ · RecordSupplierPayment/ · CreateDebitNote/
│   └── Queries/    ListBills/ · GetBill/ · GetAgedPayables/
│
├── Banking/                                 # (Stage E)
│   ├── Entities/   BankAccount
│   └── Commands/   CreateBankAccount/
│
├── Assets/                                  # (Stage E)
│   └── Entities/   FixedAsset · DepreciationSchedule
│
├── Reports/                                 # cross-cutting read models (compute from JournalLine)
│   └── Queries/    GetProfitAndLoss/ · GetBalanceSheet/ · GetCashFlow/ · GetGeneralLedger/
│                  · GetFinanceDashboard/
│
├── DTOs/
│   └── AccountingDtos.cs
│
└── Extensions/
    └── AccountingModuleExtensions.cs        # AddMediatR + register approvable actions + DI (JournalPoster as IJournalPoster)

backend/Xorva.Core/Interfaces/
├── IJournalPoster.cs                        # ★ posting contract — so HR/Payroll can post without referencing Accounting
└── JournalDraft.cs                          # ★ Core-level input DTO (accountId + debit/credit lines); no Accounting types leak

backend/Xorva.Infrastructure/Data/Configurations/Accounting/   # EF configs (one per entity)
backend/Xorva.API/Controllers/                                 # thin controllers → MediatR
backend/Tests/Xorva.Tests.Unit/Accounting/                     # engine + posting tests
```

> **Payroll is NOT here.** `PayRun` / `Payslip` live in the **HR module**. At payout HR calls `IJournalPoster.PostAsync(JournalDraft{…})` to record the salary journal. Accounting never references HR; HR references only Core.

**Wire-up (once):** add the csproj to **`XorvaERP.slnx`**; add a ProjectReference from **both `Xorva.Infrastructure` and `Xorva.API`** — this is the HR pattern: Infrastructure references the module so `XorvaDbContext` can declare the Accounting `DbSet<>`s and `ApplyConfigurationsFromAssembly` (Infrastructure assembly) auto-discovers the EF configs that live in `Infrastructure/Data/Configurations/Accounting/`. Then: add each entity's `DbSet<>` to `XorvaDbContext` (an Accounting region), call `AddAccountingModule()` in `Program.cs` (registers MediatR + `JournalPoster` as `IJournalPoster`), and add `AddValidatorsFromAssemblyContaining<…one Accounting validator…>()`. Migrations are generated as entities land (`AccountingLedger`, `AccountingContacts`, `AccountingSales`, …) — not one monolithic migration. `ModuleCatalog.Accounting` **already exists**, so a company activates Accounting through the existing SetCompanyModules command — no new storage.

## 6. The automation engine (this is what makes it "not data entry")

Three helpers turn documents into correct books automatically. **They are built first — everything else depends on them.**

### 6.1 `AccountingSettings` — the posting map

Per company, one row that tells every auto-journal *which account* to hit:

| Field | Points to |
|---|---|
| `ReceivableAccountId` | AR — customers owe us |
| `PayableAccountId` | AP — we owe suppliers |
| `SalesAccountId` | default revenue |
| `PurchaseAccountId` | default expense |
| `VatOutputAccountId` | VAT collected on sales (payable) |
| `VatInputAccountId` | VAT paid on purchases (reclaimable) |
| `DefaultBankAccountId` | where cash lands |
| `RetainedEarningsAccountId` | year-end close target |
| `RoundingAccountId` | rounding differences |
| `SalaryExpenseAccountId` · `SalaryPayableAccountId` | payroll |
| `InvoicePrefix` / `BillPrefix` / `JournalPrefix` + counters | number sequences |

Seeded automatically when the CoA template is applied (each template knows its own account codes).

> **Number-sequence concurrency.** Two invoices created at the same instant must never get the same `INV-2026-0001`. Guarantee it with a **DB unique index on `(CompanyId, Number)`** + **retry on unique-violation** (the pattern HR uses for `EmployeeCode`), or increment the counter under a row lock inside the posting transaction.

### 6.2 `JournalPoster` — the double-entry engine (the heart)

`JournalPoster` **implements the Core interface `IJournalPoster`**, so any module can post through the Core contract without referencing Accounting. Its input, `JournalDraft`, is a **Core-level DTO** (only `accountId` + amounts — no Accounting types leak into Core).

```
IJournalPoster.PostAsync(new JournalDraft {          // JournalDraft lives in Xorva.Core
    Date, Description, SourceType, SourceId,
    Lines = [ (accountId, debit, credit, contactId?, taxId?), ... ]
})
   → validates: Σdebit == Σcredit (else throw), each line debit XOR credit,
     period open, accounts exist & active          # balance enforced HERE (app)
   → assigns EntryNumber (NumberSequence, unique + retry)
   → creates JournalEntry (Status=Posted, TotalDebit==TotalCredit) + JournalLines
   → updates Account.CurrentBalance (cache only — reports still read the lines)
   → returns JournalEntry.Id  (stored on the source document)
```

Every document handler calls this — never writes journals by hand. Document + journal commit in one unit of work (atomicity law, §2). Because balance lives in one method, one set of tests covers every future document type.

### 6.3 Auto-journal recipes (the exact debits/credits)

| Action | Journal produced |
|---|---|
| Post **Invoice** (10,000 + 5% VAT) | DR Receivable 10,500 · CR Sales 10,000 · CR VAT-Output 500 |
| Receive **Customer Payment** | DR Bank · CR Receivable (allocated to invoice(s)) |
| Post **Bill** (2,000 + 5% VAT) | DR Expense 2,000 · DR VAT-Input 100 · CR Payable 2,100 |
| Pay **Supplier** | DR Payable · CR Bank |
| **Credit Note** (sales return) | reverse of invoice (CR Receivable · DR Sales/VAT) |
| **Pay Run** (payroll) | DR Salary Expense · CR Salary Payable; then CR Bank on payout |
| **Void** anything | a **reversing** journal (never delete) |
| **Year-end close** | move Revenue & Expense balances → Retained Earnings |

## 7. Entities — key fields (field-level detail in the SPECIFICATION doc)

- **Account** — `Code`, `Name`, `AccountType`, `AccountSubType`, `ParentAccountId`, `IsSystemAccount`, `CurrentBalance`, `IsActive`.
- **JournalEntry** — `EntryNumber`, `Date`, `Description`, `SourceType`, `SourceId`, `Status`, `PostedAt/By`, `TotalDebit`, `TotalCredit`. **JournalLine** — `AccountId`, `Debit`, `Credit`, `ContactId?`, `TaxRateId?`, `Description`.
- **Contact** — `Code`, `Name`, `ContactType`, `TaxNumber (TRN)`, `Email`, `PaymentTermDays`, `OutstandingBalance`.
- **Invoice/Bill** — `Number`, `ContactId`, `Date`, `DueDate`, `Status`, `Currency` (default `AED`), `SubTotal/TaxTotal/Total/AmountPaid/BalanceDue`, `JournalEntryId`. **+Line** — description, qty, unitPrice, accountId, taxRateId, amounts. *(`Currency` stored now, single-currency today, so multi-currency in E7 is not a schema change; also needed for e-invoicing.)*
- **CustomerPayment/SupplierPayment** — `Number`, `ContactId`, `Date`, `Amount`, `Currency` (default `AED`), `BankAccountId`, `Method`, `JournalEntryId`; **PaymentAllocation** — which invoice/bill + amount.
- **TaxRate** — `Name`, `Rate`, `AppliesTo`, output/input account links.
- **FiscalYear/Period** — dates, `IsClosed`.
- **FixedAsset/DepreciationSchedule** — cost, method, life, monthly depreciation journals.
- **PayRun/Payslip** *(HR module, not Accounting)* — period, employee, gross, deductions, net; posts the salary journal via `IJournalPoster`.

**Frontend conventions (every screen):** new **Accounting** sidebar group, gated by `activeCompany.activeModules.includes('Accounting')` + role. Reuse `dashboard-ui` (StatTile, BarList, SectionCard), `ui` (Card/Button/Field/Modal/SelectField), the toast system, and the existing approval flow. Success/errors are toasts, never in-modal text.

---

# PART 3 — The build, step by step

> One sequence, top to bottom. Each step lists **BE** (backend), **FE** (frontend), **Test**, and **✔ acceptance**. Every stage ends in something demoable.

## Stage A — Ledger core (the engine)

**A1 · Scaffold the module**
- BE: create `Xorva.Modules.Accounting` classlib by copying HR's csproj (references **Core only**; FluentValidation 12.1.1 + MediatR 14.2.0); add it to `XorvaERP.slnx`; add a ProjectReference from **both `Xorva.Infrastructure` and `Xorva.API`**; declare Core `IJournalPoster` + `JournalDraft` in `Xorva.Core/Interfaces/`; create `AccountingModuleExtensions.AddAccountingModule()` (registers MediatR + `IJournalPoster`→`JournalPoster`); call it in `Program.cs` + add the validators-assembly line.
- FE: add an **Accounting** sidebar group gated by `activeCompany.activeModules.includes('Accounting')` (`ModuleCatalog.Accounting` already exists); add placeholder routes.
- Test: solution builds; DI resolves the module.
- ✔ App runs; Accounting nav appears only when the company activated Accounting.

**A2 · Enums + `Account` entity + config + migration**
- BE: all enums; `Account : CompanyEntity`; EF config in `Infrastructure/Data/Configurations/Accounting/`; add `DbSet<Account>` to `XorvaDbContext`; migration `dotnet ef migrations add AccountingLedger --project Xorva.Infrastructure --startup-project Xorva.API` (run from `backend/`).
- Test: migration applies; `Accounts` table exists, CompanyId-scoped.

**A3 · Chart-of-Accounts templates + seed + list**
- BE: `ChartTemplates.cs` (General, Trading, Construction, Staffing, Software — ~30–40 accounts each); `SeedChartOfAccountsCommand`; `CreateAccount`/`UpdateAccount`/`DeactivateAccount`; `ListAccountsQuery` (flat + tree + balances).
- FE: **Chart of Accounts** page — tree view, add/edit/deactivate modal.
- Test: each template seeds the right accounts; system accounts flagged; can't delete an account that has journals.
- ✔ Activate Accounting → pick industry → editable CoA tree appears.

**A4 · `AccountingSettings` + `AccountResolver` + `NumberSequence`**
- BE: `AccountingSettings` (posting map + sequence counters, per company); `AccountResolver` (AR/AP/Bank/Sales/VAT/Retained); `NumberSequence` (next `INV-`/`BILL-`/`JV-`, unique + retry). Seeded when the template is applied.
- Test: resolver returns the correct system accounts; sequence increments & is concurrency-safe.

**A5 · Journal engine (the heart)**
- BE: `JournalEntry` + `JournalLine` (+configs; per-line XOR check + header `TotalDebit=TotalCredit` check); `JournalPoster` (implements `IJournalPoster`; balance enforced in code); `CreateManualJournalCommand` (+validator); `VoidJournalCommand` (reversal); `ListJournals`/`GetJournal`; `PeriodGuard`.
- FE: **Journals** page — list, create manual journal (lines), view, void.
- Test: balanced posts; unbalanced **rejected in the poster**; void → reversing entry; closed-period posting **rejected**.
- ✔ Post a manual journal; an unbalanced one is rejected with a clear message.

**A6 · Fiscal years/periods + activation flow**
- BE: `FiscalYear`/`FiscalPeriod` (+configs); `CreateFiscalYear`; `SetupAccountingCommand` (on activation: seed template + settings + current fiscal year + default tax).
- FE: **Accounting Settings** page; industry pick on activation.
- Test: setup seeds everything; posting into a closed period rejected.

**A7 · Trial Balance**
- BE: `GetTrialBalanceQuery` (from posted lines).
- FE: **Trial Balance** report.
- Test: seeded journals → total debit == total credit.
- ✔ TB lists all accounts; totals equal.

## Stage B — Sales cycle (money in)

**B1 · Contacts + Products + Bank accounts**
- BE: `Contact : CompanyEntity` (Code, Name, ContactType, TRN, Email, Phone, PaymentTermDays, OutstandingBalance); `Product` (Name, Code, SalesPrice, SalesAccountId, TaxRateId, IsActive); `BankAccount` (Name, linked CoA AccountId, Bank/Branch/IBAN); CRUD commands + validators; queries `ListContacts`/`GetContact`, `ListProducts`, `ListBankAccounts`; EF configs + `DbSet<>`s + migration `AccountingContacts`.
- FE: **Contacts** page (create/edit modal with TRN); **Products** page; **Bank Accounts** under Settings.
- Test: TRN persists; contact CompanyId-scoped; duplicate `Code` rejected; bank account must link a Bank-type CoA account.
- ✔ Create a customer with a TRN → it appears in the invoice customer picker.

**B2 · Tax rates**
- BE: `TaxRate` (Name, Rate, AppliesTo, OutputAccountId, InputAccountId); `SeedTaxRatesCommand` (UAE 5% / 0% / Exempt, wired to VAT-Output & VAT-Input); `CreateTaxRate`; `ListTaxRates`.
- FE: **Tax** settings — list + add rate.
- Test: seeded rates point at the correct VAT accounts; a rate computes the right tax on a line.
- ✔ A 5% VAT rate exists and is selectable on an invoice line.

**B3 · Invoices (→ auto-journal)**
- BE: `Invoice` + `InvoiceLine`; `CreateInvoiceCommand` (draft — compute per-line amount, SubTotal, TaxTotal, Total); `PostInvoiceCommand` → `JournalPoster` (**DR Receivable Total · CR Revenue per line · CR VAT-Output**; set `Status=Posted`, store `JournalEntryId`, bump `Contact.OutstandingBalance`); `VoidInvoiceCommand` (reversing journal); register **`Accounting.PostInvoice`** approvable (approval gates *posting*, not draft creation — the draft saves freely, posting waits for approval); queries `ListInvoices`/`GetInvoice`.
- FE: **Invoices** page — list (status pills), create (customer, line editor, tax dropdown, **live totals**), view (shows the journal), Post, Void; toasts; 202 → pending-approval reuses the existing approval UI.
- Test: exact recipe (10,000 + 5% → AR 10,500 / Sales 10,000 / VAT 500); multi-line totals; void → balanced reversal; posting returns **202** when a rule exists; closed period rejected.
- ✔ Post an invoice → balanced journal created, AR increases, invoice reads **Posted**.

**B4 · Customer payments**
- BE: `CustomerPayment` + `PaymentAllocation`; `RecordCustomerPaymentCommand` → `JournalPoster` (**DR Bank · CR Receivable**); allocate to one/more invoices; update `AmountPaid`/`BalanceDue` → `Paid`/`PartiallyPaid`; reduce `Contact.OutstandingBalance`; register `Accounting.RecordPayment` approvable; query `ListPayments`.
- FE: **Payments** — record payment (pick customer → open invoices → allocate), list.
- Test: AR decreases by paid amount; full → **Paid**, partial → **PartiallyPaid**; over-allocation rejected; document + journal commit atomically.
- ✔ Record a payment → the invoice settles and the bank balance rises.

## Stage C — Statements *(each: BE query → FE report page → Test)*

**C1 · Profit & Loss**
- BE: `GetProfitAndLossQuery` — Revenue − Expense over a date range, from posted `JournalLine` rows, grouped by account with subtotals.
- FE: **P&L** report — period picker, Revenue / Expenses sections, Net Profit; printable table (`tabular-nums`).
- Test: seeded journals → Net = Revenue − Expenses; respects date range + company.
- ✔ P&L shows the correct net profit for the period.

**C2 · Balance Sheet**
- BE: `GetBalanceSheetQuery` — Assets = Liabilities + Equity + current-period profit, as-at a date.
- FE: **Balance Sheet** report (Assets / Liabilities / Equity).
- Test: **Assets == Liabilities + Equity** to the cent for a seeded set.
- ✔ The Balance Sheet balances.

**C3 · Cash Flow · General Ledger · Aged AR/AP**
- BE: `GetCashFlowQuery` (bank/cash movement); `GetGeneralLedgerQuery` (per-account line history + running balance); `GetAgedReceivablesQuery`/`GetAgedPayablesQuery` (0–30 / 31–60 / 61–90 / 90+ by due date).
- FE: **Cash Flow**, **General Ledger** (account picker + date range), **Aged AR/AP** reports.
- Test: GL running balance recomputed from lines ties to `CurrentBalance`; aging buckets correct by due date.
- ✔ Drill into any account and see every movement with a running balance.

**C4 · Finance dashboard**
- BE: `GetFinanceDashboardQuery` — cash position, total AR/AP, P&L trend, overdue count.
- FE: **Accounting Dashboard** — StatTiles + BarList + trend chart (chart kit); the module's home screen.
- Test: figures match the underlying reports.
- ✔ One screen summarises the company's finances.

## Stage D — Purchases + compliance

**D1 · Bills + supplier payments**
- BE: `Bill` + `BillLine`; `CreateBill` (draft) → `PostBill` → `JournalPoster` (**DR Expense per line · DR VAT-Input · CR Payable**); `VoidBill` (reversal); `SupplierPayment` + `RecordSupplierPaymentCommand` (**DR Payable · CR Bank**); update bill status + `Contact.OutstandingBalance`; register **`Accounting.PostBill`** approvable (gates posting, not the draft); queries `ListBills`/`GetBill`.
- FE: **Bills** page (mirror of Invoices) + record-supplier-payment.
- Test: bill recipe journal; VAT-Input tracked separately; supplier payment reduces AP; atomic commit.
- ✔ Enter a bill → AP up; pay it → AP down, bank down.

**D2 · Credit / Debit notes**
- BE: `CreateCreditNoteCommand` (sales return — reverse the invoice: **CR Receivable · DR Revenue/VAT-Output**); `CreateDebitNoteCommand` (purchase return — mirror). Link to the original; adjust balances.
- FE: credit/debit note create + list, launched from the source invoice/bill.
- Test: a credit note reverses AR + VAT correctly; ledger stays balanced.
- ✔ Issue a credit note against an invoice → customer balance drops.

**D3 · VAT return**
- BE: `GetVatReturnQuery` — Output VAT − Input VAT for a period, FTA-style box summary.
- FE: **VAT Return** report — period selector; output, input, net payable.
- Test: Net VAT = Output − Input; ties to the VAT accounts in the ledger.
- ✔ VAT return figures reconcile to the ledger.

## Stage E — Completeness (post-core roadmap)

**E1 · Department-function access model** (§4) — `Department.Function`; put `DepartmentId` + Function in the JWT / `ICurrentTenantService`; upgrade every module gate to `role <= CompanyAdmin || managesFunction(module)`. Delivers "Accounting-dept manager = accountant" (plus HR/Sales managers) in one feature. FE: department Function picker; a manager sees the module for their function. Test: an accounting-dept manager can post; an HR-dept manager cannot.
**E2 · Payroll pay-runs** — HR-side `PayRun`/`Payslip`; posts the salary journal via Core `IJournalPoster`.
**E3 · Opening balances** · **E4 · Period/Year close** (roll P&L → Retained Earnings) · **E5 · Fixed assets + depreciation** · **E6 · Bank reconciliation** · **E7 · Multi-currency + FX** · **E8 · e-invoicing export (PINT AE/PEPPOL)** · **E9 · Approval amount thresholds** (`AmountThreshold` on rule + action exposes amount).

## Cross-cutting (verify every stage)
- **Multi-tenant/company isolation** holds (CompanyEntity global filter) — checked in integration tests; every controller is gated `[RequireRole(SystemRole.CompanyAdmin)]` until E1 relaxes it to also allow function-managers.
- **Multi-company consolidation** — every report query takes an optional `companyId` (like HR's `listDepartments(companyId?)`) and scopes to the active company by default; a **CEO** (`HasCrossCompanyAccess`) may omit it to get a **consolidated** view aggregating all companies in the tenant. *(This is what makes the role-matrix "CEO → all companies" real — build it into each report from C1 onward, not as an afterthought.)*
- **Approvals**: the *posting* actions register as approvable and respect the strict per-role routing already built; approved posts execute via the existing deferred-replay path (must be replay-safe).
- **Frontend** reuses the existing kit (consistent look).
- **Tests** grow with each step; the whole suite stays green.

---

# PART 4 — Testing, timeline, done

## 8. Testing plan
- **Unit (engine):** balanced journal posts; unbalanced **rejected**; void creates a reversal; closed-period posting **rejected**; invoice post produces the exact recipe; payment allocation reduces receivable.
- **Unit (reports):** seed known journals → Trial Balance balances; P&L = revenue − expense; Balance Sheet Assets = Liab + Equity.
- **Integration:** activate module (per company) → seed template → create invoice draft → **post** invoice (202 if a rule) → approve → journal exists → payment → P&L reflects it; multi-company isolation holds; a CEO consolidated report sums two companies.

## 9. Realistic timeline (honest)

| When | Deliverable |
|---|---|
| **Today** | **Stage A + B + start C** — CoA templates, Journal Engine, manual journals, invoices → auto-journal, customer payments, Trial Balance + P&L + Balance Sheet, with core tests. *A working automatic accounting engine you can demo.* |
| **Tomorrow (half day)** | Finish statements + Purchases (bills, supplier payments) + Aged AR/AP + finance dashboard + frontend pages. |
| **Follow-on (2–3 days)** | Stage E — VAT return polish, e-invoicing export, payroll pay-runs, period/year close, fixed assets, bank reconciliation, multi-currency, approval thresholds. |

> **The story for your lead:** "The automatic double-entry engine and the full sales cycle with real financial statements work today; purchases and compliance are the next short stage." Credible, and true.

## 10. Definition of done
A company can: activate Accounting → get an industry CoA → invoice customers → get paid → enter bills → pay suppliers → run manual journals → and read **Trial Balance, P&L, Balance Sheet, Cash Flow, Aged AR/AP, VAT return** — all auto-journalled, immutable, period-locked, approval-gated, and multi-company-consolidated. Payroll, fixed assets, reconciliation, multi-currency, and e-invoicing complete the picture.

## 11. Verification status — DONE ✅

Stages **A → D and E1–E9** shipped, plus multi-currency increment 2 (unrealized FX revaluation + FX manual journals). The **cross-cutting checklist (§ above) and PART 4 testing plan were then verified end-to-end**:

- **Multi-tenant/company isolation** — proven over HTTP (`TenantIsolationTests`, `AccountingCycleTests`): a second tenant's CEO sees none of another tenant's ledger.
- **Multi-company consolidation** — **built** (was the one gap): `AccountingGuard.ResolveReportScope` returns a null (consolidated) scope for a CEO who omits the company; P&L, Balance Sheet, Trial Balance and the Dashboard aggregate tenant-wide and merge accounts by code. FE: an "All companies (consolidated)" toggle on those report pages. Proven: a CEO consolidated P&L sums two companies (10,000 + 5,000 = 15,000) and never crosses the tenant.
- **Approvals on posting** — proven: posting an invoice returns **202** when a rule exists, stays **Draft**, then becomes **Posted** with a journal on approve (deferred-replay path).
- **Full cycle** — proven: activate → seed CoA → invoice → post → pay → **P&L reflects the revenue**.
- **Suite** — **105 tests green** (92 unit + 13 integration); backend build 0/0; frontend typechecks.

---

## Appendix — full feature catalog (scope reference)
- **Ledger core** *(core)*: CoA + templates · double-entry journals · manual journals · fiscal years/periods · period & year-end close · opening balances · multi-currency + FX *(ext)* · account reconciliation *(ext)*.
- **Sales / AR**: invoices · customer payments + allocation · credit notes · customer statements · AR aging *(core)*; quotes/proformas · recurring invoices · bad-debt write-off *(ext)*.
- **Purchases / AP**: bills · supplier payments · debit notes *(core)*; expense claims · cash expenses · purchase orders · AP aging *(ext)*.
- **Banking** *(ext)*: deposits/withdrawals/transfers · bank reconciliation · petty cash.
- **Tax** *(ext)*: VAT rates · VAT return (output−input) · e-invoicing (PINT AE/PEPPOL via ASP).
- **Payroll** *(ext, HR-side)*: pay runs · payslips · deductions · gratuity/EOS · salary journals.
- **Fixed assets** *(ext)*: register · depreciation schedules/journals · disposal.
- **Reporting**: Trial Balance · P&L (+comparatives) · Balance Sheet · Cash Flow · GL · Aged AR/AP *(core)*; VAT return · budget vs actual · cost-centre/departmental P&L *(ext)*.
- **Management** *(adv)*: budgets · cost centres/dimensions · KPIs · cash-flow forecast.
- **Controls** *(core)*: approvals + thresholds · immutable audit trail · RBAC · multi-company consolidation · document attachments *(ext)* · inter-company transactions *(future)*.
