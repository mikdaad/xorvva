# Xorva ERP — Database Schema (Neon PostgreSQL)

**Migrations applied to Neon: 25 (0 pending)** — auto-applied at API startup by `DbInitializer`.
- Phase 1: `InitialCreate`, `UsersEmailUniqueNullsNotDistinct`, `TenancyFoundation`, `ApprovalEngine`,
  `HRPersonRegistry`, `HRLeaveManagement`, `TenantOnboarding`.
- Phase 2 (Accounting, applied July 26): `AccountingLedger`, `AccountingSettings`, `AccountingJournals`,
  `AccountingContacts`, `AccountingTax`, `AccountingInvoices`, `AccountingPayments`, `AccountingPurchases`,
  `HRDepartmentFunction`, `HRPayroll`, `AccountingFixedAssets`, `AccountingCreditNotes`,
  `AccountingDebitNotes`, `AccountingBankReconciliation`, `ApprovalAmountThreshold`, `EInvoicingSettings`,
  `MultiCurrency`, `FxRevaluation`.

## Accounting tables (Phase 2 — all CompanyEntity, auto tenant/company isolation)

Money columns are `decimal(18,2)`; exchange rates `decimal(18,6)`; enums stored as strings.
- **Accounts** (Chart of Accounts): Code, Name, AccountType (Asset/Liability/Equity/Revenue/Expense),
  AccountSubType, ParentAccountId?, NormalBalance, IsSystemAccount, CurrentBalance (cached), IsActive.
- **AccountingSettings** (one per company): base currency; posting-map account ids (Receivable, Payable,
  Sales, Purchase, VatOutput, VatInput, Bank, Cash, RetainedEarnings, Rounding, SalaryExpense,
  SalaryPayable, **FxGainLoss**, **UnrealizedFxGainLoss**); number-sequence prefixes + counters; seller
  e-invoicing identity (LegalName, TaxRegistrationNumber, AddressLine, City, CountryCode).
- **JournalEntries**: EntryNumber, Date, Description, SourceType, SourceId?, Status (Draft/Posted/Voided),
  PostedAt/By, TotalDebit, TotalCredit. **JournalLines**: AccountId, Debit, Credit, ContactId?, TaxRateId?,
  Description, **IsReconciled** (bank rec). DB check constraints: per-line debit≥0/credit≥0/not-both, header TotalDebit=TotalCredit.
- **FiscalYears / FiscalPeriods**: dates, IsClosed (period lock).
- **Contacts**: Code, Name, ContactType (Customer/Supplier/Both), TaxNumber (TRN), Email, Phone,
  PaymentTermDays, OutstandingBalance (**base currency**), IsActive. **Products**, **BankAccounts** (linked to a Bank CoA account).
- **TaxRates**: Name, Rate, AppliesTo (Sales/Purchase/Both), Output/Input account links.
- **Invoices / InvoiceLines** and **Bills / BillLines**: Number, ContactId, Date, DueDate, Status
  (Draft/Posted/PartiallyPaid/Paid/Voided), **Currency + ExchangeRate**, SubTotal/TaxTotal/Total/
  AmountPaid/BalanceDue (transaction currency), **BaseTotal** (base-currency value posted to the ledger),
  JournalEntryId?. Lines: description, qty, unitPrice, accountId, taxRateId, TaxRatePercent, LineAmount, LineTax.
- **CustomerPayments / SupplierPayments** (+ allocation tables): Number, ContactId, Date, Amount,
  **Currency + ExchangeRate**, BankAccountId, Method, JournalEntryId; allocations link to invoice/bill + amount.
- **CreditNotes / DebitNotes** (+ lines): base-currency reversing documents.
- **ExchangeRates**: CurrencyCode, RateDate, Rate (base per 1 foreign). Unique (CompanyId, CurrencyCode, RateDate).
- **FixedAssets** (+ depreciation): cost, method, life, monthly depreciation journals.
- Payroll (HR module): **PayRuns / Payslips** — period, gross/net; PostPayRun posts the salary journal via `IJournalPoster`.
- `Departments` gained **Function** (General/HR/Accounting/Sales/Operations/Procurement) for function-based access.

## HR tables (Day 4 — all CompanyEntity, auto tenant/company isolation)

## HR tables (Day 4 — all CompanyEntity, auto tenant/company isolation)
- **Departments**: Name, Code (both unique per company), Description?, HeadEmployeeId?, ParentDepartmentId?, IsActive, SortOrder
- **Designations**: Title (unique per company), Code?, Level (1-10), Description?, IsActive, SortOrder
- **Employees**: EmployeeCode (unique per company, "EMP-0001"), name/email/phone/DOB/gender/nationality/nationalId/maritalStatus, emergency contact (name/phone/relation), DepartmentId, DesignationId, ReportingToId?, BranchId?, JoinDate, EmploymentType, EmploymentStatus, **BasicSalary decimal(18,2)**, Currency, bank (name/account/IBAN), UserId? (link to ApplicationUser), IsActive, Notes?, ProfilePhotoUrl?. Enums stored as strings. Indexes on (CompanyId, EmployeeCode) unique, (CompanyId, DepartmentId), (CompanyId, EmploymentStatus).
- **EmployeeHistories**: EmployeeId, ChangeType (Salary/Status/…), OldValue, NewValue, ChangedByUserId/Email, Reason
- **Holidays**: Name, Date, IsActive
- **LeaveTypes**: Name, Code (unique per company), DefaultDays, IsPaid, IsCarryForward, MaxCarryForward, RequiresAttachment, IsActive, SortOrder
- **LeaveAllocations**: EmployeeId, LeaveTypeId, Year (unique together), TotalDays, UsedDays, Version (concurrency token). RemainingDays computed.
- **LeaveRequests**: EmployeeId, LeaveTypeId, FromDate, ToDate, TotalDays (working days), Reason, Status (enum string), ApprovalRequestId?, RejectionReason?, AttachmentUrl?

## Approval Engine tables (Day 3)

**ApprovalRules** (CompanyEntity): Id, TenantId, CompanyId, Name, Module, ActionKey,
ApproverRoles (varchar(50), comma-separated role ints e.g. "3,2,1"), IsActive, IsMandatory.
Index `IX_ApprovalRules_CompanyId_ActionKey`. One active rule per (company, action) — enforced in handler.

**ApprovalRequests** (CompanyEntity): Id, TenantId, CompanyId, ActionKey, Title, Status (enum→string),
CommandJson (serialized command), Requester{UserId,TenantId,CompanyId,Role,Email}, RuleId?, RuleNameSnapshot,
CompletedAt?, Outcome?, **Version** (int, optimistic concurrency token). Index `IX_ApprovalRequests_CompanyId_Status`.

**ApprovalRequestSteps** (CompanyEntity): Id, TenantId, CompanyId, ApprovalRequestId (FK cascade),
Order, RequiredRole, Status (Pending/Approved/Rejected/Skipped), ActedByUserId?, ActedByEmail?, Comment?, ActedAt?.

**ApprovalRuleAudits** (CompanyEntity): Id, TenantId, CompanyId, RuleId, RuleName, ChangeType, ChangedByUserId, ChangedByEmail, Detail.

Note: no `xmin`/array columns — concurrency is a plain int Version, ApproverRoles is a string, both for SQLite-test parity.

## Tenants
| Column | Type | Notes |
|--------|------|-------|
| Id | uuid PK | |
| Name | varchar(200) NOT NULL | |
| ContactEmail | varchar(256) NOT NULL | CEO who signed up |
| IsActive | bool default true | account-level kill switch |
| CreatedAt/UpdatedAt, CreatedBy/UpdatedBy | | audit |

## Companies
| Column | Type | Notes |
|--------|------|-------|
| Id | uuid PK | |
| TenantId | uuid FK → Tenants (RESTRICT) | |
| Name | varchar(200) NOT NULL | unique per tenant (`IX_Companies_TenantId_Name`) |
| Currency | varchar(3) | ISO 4217, default AED |
| Timezone | varchar(64) | IANA, default Asia/Dubai |
| ActiveModules | text[] | validated against ModuleCatalog |
| IsActive | bool default true | |

## Branches
| Column | Type | Notes |
|--------|------|-------|
| Id | uuid PK | |
| TenantId | uuid | isolation filter column (`IX_Branches_TenantId_CompanyId`) |
| CompanyId | uuid FK → Companies (RESTRICT) | |
| Name | varchar(200) | unique per company (`IX_Branches_CompanyId_Name`) |
| Address/City/Country | varchar(500/100/100) NULL | |
| IsActive | bool default true | |

## Users
| Column | Type | Notes |
|--------|------|-------|
| Id | uuid PK | Guid v7 (sequential, index-friendly) |
| Email | varchar(256) NOT NULL | stored lowercase |
| PasswordHash | varchar(512) NOT NULL | BCrypt, work factor 12 |
| FirstName / LastName | varchar(100) NOT NULL | |
| Role | varchar(50) NOT NULL | enum as string: SystemAdmin/SuperAdmin/CompanyAdmin/Manager/Employee |
| TenantId | uuid NULL | null for SystemAdmin |
| CompanyId | uuid NULL | |
| DepartmentId | uuid NULL | FK later (HR module, Day 4) |
| IsActive | bool NOT NULL default true | |
| LastLoginAt | timestamptz NULL | |
| CreatedAt / UpdatedAt | timestamptz | set automatically in SaveChanges |

Indexes:
- `IX_Users_Email` UNIQUE — email unique **platform-wide** since Day 2 (login resolves by email alone)
- `IX_Users_TenantId`, `IX_Users_TenantId_CompanyId`

## RefreshTokens
| Column | Type | Notes |
|--------|------|-------|
| Id | uuid PK | |
| Token | varchar(512) NOT NULL | opaque base64(64 random bytes) |
| ExpiresAt | timestamptz NOT NULL | login + 7 days |
| IsRevoked | bool NOT NULL | |
| RevokedAt | timestamptz NULL | |
| ReplacedByToken | varchar(512) NULL | rotation chain |
| UserId | uuid FK → Users.Id | ON DELETE CASCADE |
| CreatedAt / UpdatedAt | timestamptz | |

Indexes: `IX_RefreshTokens_Token` UNIQUE, `IX_RefreshTokens_UserId_IsRevoked`

## Seeded data
- SystemAdmin `admin@xorva.com` (created manually July 14). `DbInitializer` re-seeds a SystemAdmin
  on startup if none exists, using user-secrets `SeedSettings:SystemAdminEmail/Password`.

## Demo data (dev Neon)
Tenant "Xorva Demo Group" with companies "Demo Trading LLC" (+branch "Dubai HQ") and
"Demo IT Solutions". Logins **verified working on Neon (July 26)**: CEO `demo.ceo@xorva.local` /
`DemoCeo@2026!` and Company Admin `demo.admin@xorva.local` / `Admin@2026!`. Activate the **Accounting**
module on a company and seed its Chart of Accounts to demo the accounting flows.
