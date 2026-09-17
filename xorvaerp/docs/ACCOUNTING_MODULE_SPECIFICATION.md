# Xorva ERP — Accounting Module: Complete Specification

**Module:** `Xorva.Modules.Accounting`  
**Author:** System Architect (20-Year Enterprise ERP Experience)  
**Date:** July 19, 2026  
**For:** Lead Presentation — Phase 2 Planning  
**Architecture:** Modular Monolith — Module-owned entities in `Modules/Xorva.Modules.Accounting/`  
**Reference:** Wafeq, Odoo, SAP, QuickBooks, ERPNext

---

## 1. What is Accounting in an ERP? (For the Lead)

### 1.1 Why Accounting is the CORE Module

In every ERP system worldwide, Accounting is NOT optional — it's the **financial nervous system**. Every other module FEEDS into accounting:

```
HR Module ──────→ Salary Journal Entries (monthly payroll expense)
Sales Module ───→ Revenue Recognition (invoice → receivable → cash)
Purchase Module → Expense Recognition (bill → payable → payment)
Inventory Module→ Cost of Goods Sold (stock movement → journal)
```

**Without accounting, the ERP is a fancy CRUD application.** With accounting, it becomes a **financial management platform** that can produce:
- Profit & Loss Statements
- Balance Sheets
- Cash Flow Statements
- Tax Reports (VAT/GST returns)
- Audit trails for government compliance

### 1.2 How a Real Company Uses Accounting Daily

```
Morning:  Accountant opens Dashboard → sees cash balance, overdue invoices, overdue bills
10:00 AM: Creates Invoice INV-0042 for Customer "Al Futtaim" → $15,000 for consulting
          System auto-creates journal: DR Accounts Receivable $15,000 / CR Revenue $15,000
11:00 AM: Records a Bill from supplier "AWS" → $3,200 hosting fees
          System auto-creates journal: DR Hosting Expense $3,200 / CR Accounts Payable $3,200
2:00 PM:  Customer pays INV-0042 via bank transfer
          System: DR Bank $15,000 / CR Accounts Receivable $15,000
3:00 PM:  Manager runs P&L report → sees Revenue $15,000, Expenses $3,200, Net Profit $11,800
End day:  CFO reviews Balance Sheet → Assets, Liabilities, Equity all balance ✅
```

### 1.3 The Double-Entry Principle (Foundation of ALL Accounting)

> **Every financial transaction has TWO sides. Debits ALWAYS equal Credits.**

This is not optional — it's the law (literally, in every country). If debits don't equal credits, the books are wrong and the company can be fined.

```
Example: Company receives $10,000 from customer

   Account              Debit      Credit
   ─────────────────────────────────────────
   Bank (Asset)         $10,000    
   Accounts Receivable              $10,000
   ─────────────────────────────────────────
   TOTAL                $10,000    $10,000  ✅ Balanced
```

---

## 2. The Complete Accounting Ecosystem for Xorva ERP

### 2.1 Module Map (What We're Building)

```
┌─────────────────────────────────────────────────────────────────┐
│                    ACCOUNTING MODULE                             │
│                                                                 │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐      │
│  │ CHART OF      │  │ JOURNAL       │  │ FINANCIAL     │      │
│  │ ACCOUNTS      │  │ ENGINE        │  │ REPORTS       │      │
│  │ (The Tree)    │  │ (The Heart)   │  │ (The Output)  │      │
│  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘      │
│          │                  │                  │                │
│  ┌───────┴──────────────────┴──────────────────┴───────┐       │
│  │              TRANSACTION MODULES                     │       │
│  │                                                      │       │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌────────┐│       │
│  │  │ SALES   │  │PURCHASES│  │  BANK   │  │ FIXED  ││       │
│  │  │ CYCLE   │  │ CYCLE   │  │ ACCOUNTS│  │ ASSETS ││       │
│  │  └─────────┘  └─────────┘  └─────────┘  └────────┘│       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                 │
│  ┌──────────────────────────────────────────────────────┐       │
│  │              SUPPORT MODULES                         │       │
│  │  Tax/VAT · Currencies · Fiscal Years · Settings      │       │
│  └──────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Sub-Module Breakdown

| # | Sub-Module | What It Does | Priority |
|---|-----------|-------------|:--------:|
| 1 | **Chart of Accounts** | The hierarchical tree of all financial accounts (Assets, Liabilities, Equity, Revenue, Expenses) | Phase 2A |
| 2 | **Journal Engine** | Double-entry recording engine — every transaction creates a balanced journal entry | Phase 2A |
| 3 | **Sales Cycle** | Customers → Quotes → Invoices → Payments → Credit Notes | Phase 2A |
| 4 | **Purchase Cycle** | Suppliers → Bills → Payments → Debit Notes → Purchase Orders | Phase 2B |
| 5 | **Bank Accounts** | Bank tracking, reconciliation, cash management | Phase 2B |
| 6 | **Fixed Assets** | Asset registration, depreciation schedules | Phase 2C |
| 7 | **Tax/VAT Management** | Tax rates, VAT returns, tax reports | Phase 2B |
| 8 | **Financial Reports** | P&L, Balance Sheet, Cash Flow, Trial Balance, Aged AR/AP | Phase 2A |
| 9 | **Fiscal Years & Periods** | Year/period management, period closing | Phase 2A |

---

## 3. Entity Design — Complete Field-Level Specification

### 3.1 Chart of Accounts (CoA)

**The Chart of Accounts is the TREE STRUCTURE of every financial account.** Every transaction touches at least two accounts from this tree.

**Location:** `Modules/Xorva.Modules.Accounting/Entities/Account.cs`  
**Base class:** `CompanyEntity`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `Code` | `string` | Required, max 20, unique per company | Account code: "1000", "1100", "2000" |
| `Name` | `string` | Required, max 200 | "Cash", "Accounts Receivable", "Revenue" |
| `AccountType` | `AccountType` enum | Required | Asset, Liability, Equity, Revenue, Expense |
| `AccountSubType` | `AccountSubType` enum | Optional | CurrentAsset, FixedAsset, Bank, Tax, etc. |
| `ParentAccountId` | `Guid?` | FK → Account (self-ref) | For sub-accounts: 1000 Cash → 1001 Petty Cash |
| `Description` | `string?` | Max 500 | |
| `Currency` | `string` | Default from company | Account currency (multi-currency support) |
| `IsSystemAccount` | `bool` | Default false | Protected accounts created by system (AR, AP, Bank) |
| `IsBankAccount` | `bool` | Default false | Links to BankAccount entity |
| `IsReconcilable` | `bool` | Default false | Can this account be bank-reconciled? |
| `OpeningBalance` | `decimal` | Default 0 | Balance at company setup |
| `CurrentBalance` | `decimal` | Computed | Running balance (updated on journal post) |
| `IsActive` | `bool` | Default true | |
| `SortOrder` | `int` | Default 0 | Display ordering within parent |
| `Level` | `int` | Computed | Depth in hierarchy (0 = root) |

**Account Types (The 5 Fundamental Categories):**

```
ASSETS (what the company OWNS)
├── Current Assets
│   ├── 1000 Cash & Bank
│   ├── 1100 Accounts Receivable
│   ├── 1200 Inventory
│   └── 1300 Prepaid Expenses
└── Fixed Assets
    ├── 1500 Equipment
    ├── 1600 Vehicles
    └── 1700 Property

LIABILITIES (what the company OWES)
├── Current Liabilities
│   ├── 2000 Accounts Payable
│   ├── 2100 Accrued Expenses
│   ├── 2200 VAT Payable
│   └── 2300 Employee Payables
└── Long-Term Liabilities
    └── 2500 Bank Loans

EQUITY (owner's stake)
├── 3000 Owner's Capital
├── 3100 Retained Earnings
└── 3200 Current Year Earnings

REVENUE (money earned)
├── 4000 Sales Revenue
├── 4100 Service Revenue
├── 4200 Interest Income
└── 4300 Other Income

EXPENSES (money spent)
├── 5000 Cost of Goods Sold
├── 5100 Salaries & Wages ←── Fed by HR/Payroll
├── 5200 Rent Expense
├── 5300 Utilities
├── 5400 Marketing
└── 5500 Office Supplies
```

**Default CoA Seed:** When a company activates the Accounting module, seed a standard Chart of Accounts (~30-40 accounts) based on industry. This is how Wafeq, QuickBooks, and Xero do it.

**Business Rules:**
- Code must be unique within the company
- Cannot delete an account that has journal entries
- System accounts (AR, AP, Bank, Tax) cannot be deleted
- Parent account must be the same AccountType
- The accounting equation must ALWAYS hold: `Assets = Liabilities + Equity`

---

### 3.2 Fiscal Year & Period

**Location:** `Modules/Xorva.Modules.Accounting/Entities/FiscalYear.cs`  
**Base class:** `CompanyEntity`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `Name` | `string` | Required | "FY 2026", "FY 2026-2027" |
| `StartDate` | `DateOnly` | Required | First day of fiscal year |
| `EndDate` | `DateOnly` | Required, > StartDate | Last day of fiscal year |
| `IsClosed` | `bool` | Default false | Closed years cannot accept new journals |
| `IsActive` | `bool` | Default true | Currently active fiscal year |
| `ClosedAt` | `DateTime?` | | When the year was closed |
| `ClosedBy` | `Guid?` | FK → User | Who closed it |

**Fiscal Period** (sub-entity — months within a year):

| Field | Type | Description |
|-------|------|-------------|
| `FiscalYearId` | `Guid` | FK → FiscalYear |
| `Name` | `string` | "January 2026", "Q1 2026" |
| `PeriodNumber` | `int` | 1-12 (or 1-4 for quarterly) |
| `StartDate` | `DateOnly` | |
| `EndDate` | `DateOnly` | |
| `IsClosed` | `bool` | Closed periods reject new journals |

---

### 3.3 Journal Entry (The Heart of Double-Entry)

**Every financial transaction = one Journal Entry with 2+ lines that balance to zero.**

**Location:** `Modules/Xorva.Modules.Accounting/Entities/JournalEntry.cs`  
**Base class:** `CompanyEntity`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `EntryNumber` | `string` | Auto-gen, unique per company | "JV-2026-0001" |
| `Date` | `DateOnly` | Required | Transaction date |
| `Reference` | `string?` | Max 100 | External ref: invoice #, bill #, check # |
| `Description` | `string` | Required, max 500 | "Sales Invoice INV-0042 - Al Futtaim" |
| `SourceType` | `JournalSourceType` enum | Required | Manual, SalesInvoice, PurchaseBill, Payment, BankTransfer, Payroll, Opening, Adjustment |
| `SourceId` | `Guid?` | | FK to the originating document (Invoice.Id, Bill.Id, etc.) |
| `FiscalYearId` | `Guid` | FK → FiscalYear | Must be in an open fiscal year |
| `Status` | `JournalStatus` enum | Required | Draft, Posted, Voided |
| `PostedAt` | `DateTime?` | | When the journal was posted |
| `PostedBy` | `Guid?` | FK → User | |
| `IsAutoGenerated` | `bool` | Default false | Created by system (invoice, bill) vs. manual |
| `TotalDebit` | `decimal` | Computed | Sum of debit lines |
| `TotalCredit` | `decimal` | Computed | Sum of credit lines |

**Journal Entry Line** (the actual debit/credit entries):

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `JournalEntryId` | `Guid` | FK → JournalEntry | |
| `AccountId` | `Guid` | FK → Account, Required | Which CoA account |
| `Description` | `string?` | Max 300 | Line-level description |
| `DebitAmount` | `decimal(18,2)` | >= 0 | Debit (left side) |
| `CreditAmount` | `decimal(18,2)` | >= 0 | Credit (right side) |
| `Currency` | `string` | Default from account | |
| `ExchangeRate` | `decimal` | Default 1.0 | For multi-currency |
| `TaxId` | `Guid?` | FK → TaxRate | If this line has tax |
| `ContactId` | `Guid?` | FK → Contact | Customer or Supplier (for AR/AP tracking) |
| `SortOrder` | `int` | | Line ordering |

**Critical Business Rules:**
- `SUM(DebitAmount) MUST = SUM(CreditAmount)` — enforced at handler AND database level
- Each line must have EITHER debit OR credit, never both
- Cannot post to a closed fiscal period
- Posted journals cannot be edited — only voided (creates a reversing journal)
- Voided journals keep the original + create an automatic reversal entry

---

### 3.4 Contact (Customers & Suppliers)

**A Contact is either a Customer (who owes US money) or a Supplier (who WE owe money to), or both.**

**Location:** `Modules/Xorva.Modules.Accounting/Entities/Contact.cs`  
**Base class:** `CompanyEntity`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `Code` | `string` | Auto-gen, unique per company | "CUST-0001", "SUPP-0001" |
| `Name` | `string` | Required, max 200 | Business name |
| `ContactType` | `ContactType` enum | Required | Customer, Supplier, Both |
| `Email` | `string?` | Max 256 | |
| `Phone` | `string?` | Max 20 | |
| `TaxNumber` | `string?` | Max 50 | VAT/TRN number |
| `Address` | `string?` | Max 500 | |
| `City` | `string?` | Max 100 | |
| `Country` | `string?` | Max 100 | |
| `Currency` | `string` | Default from company | Preferred currency |
| `PaymentTermDays` | `int` | Default 30 | Net 30, Net 60, etc. |
| `CreditLimit` | `decimal?` | | Max outstanding balance |
| `DefaultAccountId` | `Guid?` | FK → Account | Default revenue/expense account |
| `OutstandingBalance` | `decimal` | Computed | Current receivable/payable |
| `IsActive` | `bool` | Default true | |
| `Notes` | `string?` | Max 2000 | |

---

### 3.5 Invoice (Sales)

**An invoice records what a customer owes the company.** Auto-generates a journal entry when posted.

**Location:** `Modules/Xorva.Modules.Accounting/Entities/Invoice.cs`  
**Base class:** `CompanyEntity`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `InvoiceNumber` | `string` | Auto-gen, unique per company | "INV-2026-0001" |
| `ContactId` | `Guid` | FK → Contact (Customer) | Who owes us |
| `InvoiceDate` | `DateOnly` | Required | Issue date |
| `DueDate` | `DateOnly` | Required | Payment due date |
| `Reference` | `string?` | Max 100 | PO number, contract ref |
| `Status` | `InvoiceStatus` enum | Required | Draft, Sent, Paid, PartiallyPaid, Overdue, Voided |
| `Currency` | `string` | Default from contact | |
| `SubTotal` | `decimal` | Computed | Sum of line amounts |
| `TaxTotal` | `decimal` | Computed | Sum of tax amounts |
| `Total` | `decimal` | Computed | SubTotal + TaxTotal |
| `AmountPaid` | `decimal` | Computed | Sum of payments applied |
| `BalanceDue` | `decimal` | Computed | Total - AmountPaid |
| `JournalEntryId` | `Guid?` | FK → JournalEntry | Auto-created on post |
| `Notes` | `string?` | Max 2000 | Internal notes |
| `CustomerNotes` | `string?` | Max 2000 | Visible on invoice PDF |
| `Terms` | `string?` | Max 2000 | Payment terms text |

**Invoice Line:**

| Field | Type | Description |
|-------|------|-------------|
| `InvoiceId` | `Guid` | FK → Invoice |
| `Description` | `string` | Product/service description |
| `AccountId` | `Guid` | FK → Account (Revenue account) |
| `Quantity` | `decimal` | |
| `UnitPrice` | `decimal` | |
| `Amount` | `decimal` | Quantity × UnitPrice |
| `TaxRateId` | `Guid?` | FK → TaxRate |
| `TaxAmount` | `decimal` | |
| `LineTotal` | `decimal` | Amount + TaxAmount |
| `SortOrder` | `int` | |

**Auto-Generated Journal on Invoice Post:**
```
DR  Accounts Receivable    $11,500   (Contact: Al Futtaim)
DR  VAT Receivable         $   500   (5% VAT)
CR  Revenue - Consulting   $10,000
CR  Revenue - Support      $ 1,500
CR  VAT Payable            $   500
```

---

### 3.6 Bill (Purchases)

**A bill records what the company owes a supplier.** Mirror image of Invoice.

**Location:** `Modules/Xorva.Modules.Accounting/Entities/Bill.cs`  
**Base class:** `CompanyEntity`

| Field | Type | Description |
|-------|------|-------------|
| `BillNumber` | `string` | Auto-gen or manual: "BILL-2026-0001" |
| `ContactId` | `Guid` | FK → Contact (Supplier) |
| `BillDate` | `DateOnly` | |
| `DueDate` | `DateOnly` | |
| `Status` | `BillStatus` enum | Draft, Received, Paid, PartiallyPaid, Overdue, Voided |
| `SubTotal, TaxTotal, Total, AmountPaid, BalanceDue` | `decimal` | Same as invoice |
| `JournalEntryId` | `Guid?` | Auto-created journal |

**Auto-Generated Journal on Bill Post:**
```
DR  Office Supplies (Expense)  $2,000
DR  VAT Receivable             $  100   (input VAT — claimable)
CR  Accounts Payable           $2,100   (Contact: Office Depot)
```

---

### 3.7 Payment

**Records money moving in (from customer) or out (to supplier).**

**Location:** `Modules/Xorva.Modules.Accounting/Entities/Payment.cs`  
**Base class:** `CompanyEntity`

| Field | Type | Description |
|-------|------|-------------|
| `PaymentNumber` | `string` | Auto-gen: "PAY-2026-0001" |
| `ContactId` | `Guid` | FK → Contact |
| `PaymentType` | `PaymentType` enum | CustomerPayment, SupplierPayment |
| `PaymentDate` | `DateOnly` | |
| `Amount` | `decimal` | Total payment amount |
| `BankAccountId` | `Guid` | FK → BankAccount (where the money goes/comes from) |
| `PaymentMethod` | `PaymentMethod` enum | BankTransfer, Cash, Cheque, Card, Online |
| `Reference` | `string?` | Cheque #, transaction ref |
| `JournalEntryId` | `Guid?` | Auto-created journal |
| `Status` | `PaymentStatus` enum | Draft, Confirmed, Voided |

**Payment Allocation** (which invoices/bills this payment covers):

| Field | Type | Description |
|-------|------|-------------|
| `PaymentId` | `Guid` | FK → Payment |
| `InvoiceId` or `BillId` | `Guid` | Which document |
| `AllocatedAmount` | `decimal` | How much of the payment goes here |

**Auto-Generated Journal (Customer Payment):**
```
DR  Bank (Asset)               $15,000
CR  Accounts Receivable        $15,000  (Contact: Al Futtaim, Invoice INV-0042)
```

---

### 3.8 Bank Account

**Location:** `Modules/Xorva.Modules.Accounting/Entities/BankAccount.cs`  
**Base class:** `CompanyEntity`

| Field | Type | Description |
|-------|------|-------------|
| `AccountId` | `Guid` | FK → Account (CoA account with IsBankAccount=true) |
| `BankName` | `string` | "Emirates NBD", "ADCB" |
| `AccountNumber` | `string` | |
| `IBAN` | `string?` | |
| `Currency` | `string` | |
| `CurrentBalance` | `decimal` | |
| `IsDefault` | `bool` | Default bank for payments |
| `IsActive` | `bool` | |

---

### 3.9 Tax Rate

**Location:** `Modules/Xorva.Modules.Accounting/Entities/TaxRate.cs`  
**Base class:** `CompanyEntity`

| Field | Type | Description |
|-------|------|-------------|
| `Name` | `string` | "VAT 5%", "VAT 0%", "Exempt" |
| `Code` | `string` | "VAT5", "VAT0", "EXEMPT" |
| `Rate` | `decimal` | 5.00, 0.00, etc. |
| `TaxType` | `TaxType` enum | Sales, Purchase, Both |
| `SalesAccountId` | `Guid?` | FK → Account (VAT Payable / Output) |
| `PurchaseAccountId` | `Guid?` | FK → Account (VAT Receivable / Input) |
| `IsDefault` | `bool` | |
| `IsActive` | `bool` | |

**UAE Default Seed:** 5% VAT (standard), 0% VAT (zero-rated), Exempt.

---

### 3.10 Credit Note / Debit Note

**Credit Note** (reverses an Invoice — partial or full return):

| Field | Type | Description |
|-------|------|-------------|
| `CreditNoteNumber` | `string` | Auto-gen: "CN-2026-0001" |
| `OriginalInvoiceId` | `Guid` | FK → Invoice |
| `ContactId` | `Guid` | FK → Contact |
| `Amount, TaxAmount, Total` | `decimal` | |
| `Reason` | `string` | Why the credit |
| `JournalEntryId` | `Guid?` | Reversal journal |

**Debit Note** (same pattern, reverses a Bill).

---

## 4. API Endpoints — Complete

### 4.1 Chart of Accounts
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/accounts` | CompanyAdmin+ | Create account |
| `GET` | `/api/accounts` | Manager+ | List (tree or flat) |
| `GET` | `/api/accounts/{id}` | Manager+ | Get with balance |
| `PUT` | `/api/accounts/{id}` | CompanyAdmin+ | Update |
| `DELETE` | `/api/accounts/{id}` | CompanyAdmin+ | Soft-delete (blocked if has journals) |
| `POST` | `/api/accounts/seed-defaults` | CompanyAdmin+ | Seed standard CoA |

### 4.2 Contacts (Customers & Suppliers)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/contacts` | CompanyAdmin+ | Create customer/supplier |
| `GET` | `/api/contacts?type=Customer` | Manager+ | List with filters |
| `GET` | `/api/contacts/{id}` | Manager+ | Get with outstanding balance |
| `PUT` | `/api/contacts/{id}` | CompanyAdmin+ | Update |
| `GET` | `/api/contacts/{id}/statement` | Manager+ | Statement of account |

### 4.3 Invoices (Sales)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/invoices` | CompanyAdmin+ | Create invoice (approvable) |
| `GET` | `/api/invoices` | Manager+ | List with status filter |
| `GET` | `/api/invoices/{id}` | Manager+ | Get with lines + payments |
| `PUT` | `/api/invoices/{id}` | CompanyAdmin+ | Update (draft only) |
| `POST` | `/api/invoices/{id}/post` | CompanyAdmin+ | Post → creates journal |
| `POST` | `/api/invoices/{id}/void` | CompanyAdmin+ | Void → reversal journal |

### 4.4 Bills (Purchases)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/bills` | CompanyAdmin+ | Create bill (approvable) |
| `GET` | `/api/bills` | Manager+ | List |
| `POST` | `/api/bills/{id}/post` | CompanyAdmin+ | Post |
| `POST` | `/api/bills/{id}/void` | CompanyAdmin+ | Void |

### 4.5 Payments
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/payments` | CompanyAdmin+ | Record payment (approvable) |
| `GET` | `/api/payments` | Manager+ | List |
| `POST` | `/api/payments/{id}/confirm` | CompanyAdmin+ | Confirm → journal |
| `POST` | `/api/payments/{id}/void` | CompanyAdmin+ | Void |

### 4.6 Journal Entries (Manual)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/journals` | CompanyAdmin+ | Create manual journal |
| `GET` | `/api/journals` | Manager+ | List |
| `POST` | `/api/journals/{id}/post` | CompanyAdmin+ | Post (balance must = 0) |
| `POST` | `/api/journals/{id}/void` | CompanyAdmin+ | Void |

### 4.7 Reports
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/reports/profit-loss` | Manager+ | P&L for date range |
| `GET` | `/api/reports/balance-sheet` | Manager+ | Balance sheet at date |
| `GET` | `/api/reports/trial-balance` | Manager+ | Trial balance for period |
| `GET` | `/api/reports/cash-flow` | Manager+ | Cash flow statement |
| `GET` | `/api/reports/aged-receivables` | Manager+ | Aged AR by customer |
| `GET` | `/api/reports/aged-payables` | Manager+ | Aged AP by supplier |
| `GET` | `/api/reports/general-ledger` | Manager+ | Account transactions |
| `GET` | `/api/reports/vat-return` | CompanyAdmin+ | VAT summary |

### 4.8 Bank Accounts & Tax
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST/GET/PUT` | `/api/bank-accounts` | CompanyAdmin+ | Bank account CRUD |
| `POST/GET/PUT` | `/api/tax-rates` | CompanyAdmin+ | Tax rate CRUD |
| `POST` | `/api/tax-rates/seed-defaults` | CompanyAdmin+ | Seed UAE VAT rates |

---

## 5. Approval Engine Integration

| ActionKey | Action | Typical Chain |
|-----------|--------|---------------|
| `Accounting.CreateInvoice` | New invoice > threshold | CompanyAdmin → CEO |
| `Accounting.RecordPayment` | Payment > threshold | CompanyAdmin → CEO |
| `Accounting.CreateBill` | Supplier bill | Manager → CompanyAdmin |
| `Accounting.ManualJournal` | Manual adjustment | CompanyAdmin → CEO |
| `Accounting.VoidTransaction` | Void invoice/bill/payment | CompanyAdmin → CEO |

**Threshold Rules:** Approval rules can be configured with amount thresholds. E.g., "Any invoice > AED 50,000 needs CEO approval."

---

## 6. How Accounting Connects to HR (Already Built)

```
HR Module (Phase 1) ──────────────────→ Accounting Module (Phase 2)

Monthly Payroll Run:
├── For each employee:
│   DR  Salaries Expense (5100)     $15,000  ← Employee.BasicSalary
│   CR  Bank (1000)                 $13,500  ← Net pay (after deductions)
│   CR  Tax Payable (2200)          $ 1,500  ← Withholding
│
└── One journal entry per pay run, auto-generated
```

This is why we built HR first — the salary data feeds directly into accounting journal entries.

---

## 7. Financial Reports — What Each Report Shows

### 7.1 Profit & Loss (Income Statement)
```
Revenue
  Sales Revenue                    $150,000
  Service Revenue                  $ 45,000
  ─────────────────────────────────────────
  Total Revenue                    $195,000

Cost of Goods Sold
  COGS                            ($80,000)
  ─────────────────────────────────────────
  Gross Profit                     $115,000

Expenses
  Salaries & Wages                ($45,000) ← From HR payroll journals
  Rent                            ($10,000)
  Utilities                       ($ 3,000)
  Marketing                       ($ 8,000)
  ─────────────────────────────────────────
  Total Expenses                  ($66,000)

  ═══════════════════════════════════════
  NET PROFIT                       $49,000
```

### 7.2 Balance Sheet
```
ASSETS
  Current Assets
    Cash & Bank                    $120,000
    Accounts Receivable            $ 45,000
    Inventory                      $ 30,000
  Fixed Assets
    Equipment                      $ 80,000
    Less: Depreciation            ($20,000)
  ─────────────────────────────────────────
  TOTAL ASSETS                     $255,000

LIABILITIES
  Current Liabilities
    Accounts Payable               $ 25,000
    VAT Payable                    $  5,000
    Employee Payables              $ 12,000 ← From HR
  Long-Term Liabilities
    Bank Loan                      $ 50,000
  ─────────────────────────────────────────
  TOTAL LIABILITIES                $ 92,000

EQUITY
  Owner's Capital                  $100,000
  Retained Earnings                $ 14,000
  Current Year Profit              $ 49,000 ← From P&L
  ─────────────────────────────────────────
  TOTAL EQUITY                     $163,000

  ═══════════════════════════════════════
  TOTAL L + E                      $255,000 ✅ = ASSETS
```

### 7.3 Aged Receivables (Who Owes Us Money)
```
Customer          Current   1-30 days  31-60 days  61-90 days  90+ days   Total
────────────────────────────────────────────────────────────────────────────────
Al Futtaim        $15,000   $8,000     $0          $0          $0         $23,000
TechCorp          $0        $5,000     $3,000      $0          $0         $ 8,000
OldClient         $0        $0         $0          $0          $12,000    $12,000 ⚠️
────────────────────────────────────────────────────────────────────────────────
TOTAL             $15,000   $13,000    $3,000      $0          $12,000    $43,000
```

---

## 8. Multi-Tenancy Rules (Same as HR)

Every accounting entity extends `CompanyEntity` → automatic tenant + company isolation:

```
Tenant: RightSource Group
├── Company: RightSource Trading
│   ├── CoA: Asset → Cash ($50,000)       ← Trading's books
│   ├── Invoice: INV-0001 to Al Futtaim   ← Trading's customers
│   └── Journal: JV-2026-0001             ← Trading's transactions
│
└── Company: RightSource IT
    ├── CoA: Asset → Cash ($30,000)        ← IT's books (SEPARATE)
    ├── Invoice: INV-0001 to TechCorp      ← IT's customers
    └── Journal: JV-2026-0001              ← IT's transactions (DIFFERENT company)
```

Each company has its OWN Chart of Accounts, its OWN invoices, its OWN financial statements. The CEO can see consolidated across companies.

---

## 9. Build Plan — Phased Approach

### Phase 2A (Core — 2 Weeks)
| Week | What |
|:----:|------|
| 1 | Chart of Accounts (CRUD + seed) + Fiscal Years + Journal Engine (manual journals with balance enforcement) + Tax Rates |
| 2 | Contacts (Customers/Suppliers) + Sales Invoices (CRUD + post + journal auto-gen) + Payments (customer) + Basic Reports (P&L, Balance Sheet, Trial Balance) |

### Phase 2B (Expansion — 2 Weeks)
| Week | What |
|:----:|------|
| 3 | Purchase Bills + Supplier Payments + Credit Notes / Debit Notes + Aged AR/AP reports |
| 4 | Bank Accounts + Bank Reconciliation + VAT Reports + Cash Flow Statement |

### Phase 2C (Advanced — 1 Week)
| Week | What |
|:----:|------|
| 5 | Fixed Assets + Depreciation Schedules + Recurring Invoices + Dashboard (P&L chart, overdue widgets) |

---

## 10. Entity Count Summary

| Entity | Fields | Complexity |
|--------|:------:|:----------:|
| Account (CoA) | 15 | Medium |
| FiscalYear | 7 | Low |
| FiscalPeriod | 6 | Low |
| JournalEntry | 13 | High |
| JournalEntryLine | 11 | High |
| Contact | 16 | Medium |
| Invoice | 17 | High |
| InvoiceLine | 10 | Medium |
| Bill | 15 | High |
| BillLine | 10 | Medium |
| Payment | 12 | High |
| PaymentAllocation | 3 | Low |
| BankAccount | 8 | Low |
| TaxRate | 9 | Medium |
| CreditNote | 8 | Medium |
| DebitNote | 8 | Medium |
| **Total** | **~168 fields** | **16 entities** |

Compare: HR Module had 8 entities with ~95 fields. Accounting is **2× larger**.

---

## 11. What Xorva Has vs. Wafeq (the Reference)

| Feature | Wafeq | Xorva Phase 2 | Notes |
|---------|:-----:|:--------------:|-------|
| Chart of Accounts | ✅ | ✅ Phase 2A | Hierarchical tree, seeded defaults |
| Manual Journals | ✅ | ✅ Phase 2A | Double-entry with balance enforcement |
| Customers | ✅ | ✅ Phase 2A | Contact entity with type=Customer |
| Invoices | ✅ | ✅ Phase 2A | CRUD + post + auto-journal |
| Customer Payments | ✅ | ✅ Phase 2A | Payment + allocation to invoices |
| Credit Notes | ✅ | ✅ Phase 2B | Reversal of invoice |
| Suppliers | ✅ | ✅ Phase 2A | Contact entity with type=Supplier |
| Bills | ✅ | ✅ Phase 2B | Purchase side |
| Supplier Payments | ✅ | ✅ Phase 2B | |
| Debit Notes | ✅ | ✅ Phase 2B | Reversal of bill |
| Purchase Orders | ✅ | ❌ Phase 3 | Workflow doc (not pure accounting) |
| Bank Accounts | ✅ | ✅ Phase 2B | |
| Fixed Assets | ✅ | ✅ Phase 2C | |
| Quotes & Proformas | ✅ | ❌ Phase 3 | Sales workflow |
| Recurring Invoices | ✅ | ✅ Phase 2C | |
| Cash Invoices | ✅ | ✅ Phase 2B | Invoice + immediate payment |
| Financial Reports | ✅ | ✅ Phase 2A-B | P&L, BS, TB, CF, Aged AR/AP |
| VAT Reports | ✅ | ✅ Phase 2B | UAE 5% VAT |
| Payroll Integration | ✅ | ✅ Phase 2A | HR salary → journal entries |
| API Invoices | ✅ | ❌ Phase 3 | External API for invoice creation |
| Multi-Company | ❌ | ✅ Already | Xorva's advantage — built into core |
| Approval Engine | ❌ | ✅ Already | Xorva's advantage — invoice approvals |
| Inventory | ✅ | ❌ Separate module | Own module |

**Xorva's ADVANTAGES over Wafeq:**
1. **Multi-Tenant Multi-Company** — Wafeq is single-company. Xorva has Tenant → Company isolation from Day 1.
2. **Approval Engine** — Wafeq has no approval workflows. Xorva can gate invoices, payments, bills through approval chains.
3. **HR Integration** — Wafeq has basic payroll. Xorva has a full HR module (departments, designations, leave management) that feeds into accounting.

---

## 12. Summary for the Lead

> **Phase 1 is COMPLETE:**
> - Auth (JWT, RBAC, 5 roles) ✅
> - Tenants (multi-company, module activation) ✅
> - Approval Engine (dynamic rules, pipeline interception) ✅
> - HR Module (departments, employees, leave management) ✅
> - Frontend (sidebar, dashboards, onboarding) ✅
> - 35/35 tests, Build 0/0, 52+ endpoints, 17 pages
>
> **Phase 2 — Accounting Module:**
> - 16 entities, ~168 fields, ~40 new endpoints
> - Double-entry journal engine (the heart)
> - Full sales + purchase cycles
> - Financial reports (P&L, Balance Sheet, Cash Flow)
> - Plugs into the EXISTING approval engine + multi-tenancy
> - 5 weeks estimated (2A: 2 weeks, 2B: 2 weeks, 2C: 1 week)
>
> **What makes Xorva BETTER than Wafeq:**
> Multi-company, approval workflows, complete HR integration — none of which Wafeq offers.
