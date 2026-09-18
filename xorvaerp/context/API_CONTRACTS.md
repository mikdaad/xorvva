# Xorva ERP — API Contracts

Base URL (dev): `http://localhost:5270` · Swagger: `/swagger`
Every response is wrapped in `ApiResponse`: `{ success, data?, message?, errors? }`.

## POST /api/auth/login — AllowAnonymous
Request: `{ "email": string, "password": string }`
- 200 `data`: `{ accessToken, refreshToken, expiresAt, user: UserDto }`
- 401 `"Invalid credentials."` (generic — same for unknown email and wrong password)
- 403 account deactivated

## POST /api/auth/register — Bearer + CompanyAdmin↑
Request: `{ email, password, firstName, lastName, role, tenantId?, companyId?, departmentId? }`
- `role` numeric: 0 SystemAdmin, 1 SuperAdmin, 2 CompanyAdmin, 3 Manager, 4 Employee — must be STRICTLY lower privilege (greater number) than caller
- Server forces tenantId (non-SystemAdmin callers) and companyId (CompanyAdmin callers) from the caller's JWT — request values ignored
- Password policy: 8–128 chars, upper + lower + digit + special
- 201 `data: UserDto` · 400 validation · 401 no token · 403 role violation · 409 duplicate email

## POST /api/auth/refresh — AllowAnonymous
Request: `{ "token": string }` (the refresh token)
- 200 new `{ accessToken, refreshToken, expiresAt, user }` — old token revoked (rotation)
- 401 invalid/expired token
- 403 reuse of a revoked token → ALL of that user's sessions revoked

## GET /api/auth/me — Bearer
- 200 `data: UserDto` of the caller

## GET /api/users — Bearer + Manager↑
Query: `role?` (numeric), `page` (default 1), `pageSize` (default 20), `search?`
- 200 `data`: `{ items: UserDto[], totalCount, page, pageSize, totalPages, hasNextPage, hasPreviousPage }`
- Scope by caller role: SystemAdmin → all; SuperAdmin → own tenant; CompanyAdmin/Manager → own company
- 403 for Employee

## POST /api/tenants/register — AllowAnonymous (PUBLIC SaaS signup)
Request: `{ tenantName, companyName, email, password, firstName, lastName }`
- Atomically creates Tenant + first Company (defaults: AED, Asia/Dubai, modules ["HR"]) + SuperAdmin user (CompanyId null — tenant-wide)
- 201 `data`: `{ tenantId, tenantName, companyId, companyName, adminEmail }` — NO tokens; client logs in next
- 400 validation (same password policy) · 409 email already exists (platform-wide)

## GET /api/tenants/current — Bearer + Manager↑
- 200 `data`: `{ id, name, contactEmail, isActive, createdAt, companyCount }` (always caller's own tenant)
- 404 for SystemAdmin (no tenant context)

## GET /api/companies — Bearer + Manager↑
- 200 `data: CompanyDto[]` — SuperAdmin: all in tenant; CompanyAdmin/Manager: own company only

## POST /api/companies — Bearer + SuperAdmin
Request: `{ name, currency?, timezone?, activeModules? }` (defaults AED / Asia/Dubai / ["HR"])
- 201 `data: CompanyDto` · 400 unknown module · 409 duplicate name in tenant

## PUT /api/companies/{id}/settings — Bearer + CompanyAdmin↑
Request: `{ name, currency (ISO 3), timezone (IANA) }`
- 200 · 403 CompanyAdmin touching another company · 404 not in caller's tenant

## PUT /api/companies/{id}/modules — Bearer + SuperAdmin
Request: `{ modules: string[] }` — validated against catalog: HR, Accounting, Sales, Purchasing, Inventory, Payroll, POS, Reports
- 200 · 400 unknown module or empty list · 404 not in tenant

## GET /api/branches?companyId= — Bearer + Manager↑
- 200 `data: BranchDto[]` — company-scoped filter applies (SuperAdmin: all tenant branches; others: own company)

## POST /api/branches — Bearer + CompanyAdmin↑
Request: `{ companyId, name, address?, city?, country? }`
- 201 · 403 CompanyAdmin targeting another company · 404 foreign/unknown company (never 403 — no id leakage) · 409 duplicate branch name in company

## CompanyDto
`{ id, name, currency, timezone, activeModules: string[], isActive, createdAt }`
## BranchDto
`{ id, companyId, name, address?, city?, country?, isActive, createdAt }`

## Approval Engine (Day 3)

Intercepted approvable actions (currently `POST /api/branches` and `POST /api/auth/register`)
return **HTTP 202** with `{ success:true, pendingApproval:true, approvalRequestId }` instead of
executing, when an active rule matches. Otherwise they behave normally.

### Rules — /api/approval-rules (Bearer + CompanyAdmin↑)
- `GET /registry?companyId=` → `data: [{ module, actions:[{actionKey, displayName}] }]` (dynamic dropdowns; filtered to the company's active modules + foundation actions)
- `GET /?companyId=` → `data: ApprovalRuleDto[]`
- `POST /` `{ companyId, name, actionKey, approverRoles:[RoleName], isActive, isMandatory }` → 201 · 409 duplicate active rule · 400 unknown action/module · IsMandatory requires CEO
- `PUT /{id}` `{ name, approverRoles, isActive, isMandatory }` → 200 · 403 (CompanyAdmin editing a Mandatory rule or another company's)
- `DELETE /{id}` → 200 · 403 (Mandatory, non-CEO)

ApprovalRuleDto: `{ id, companyId, name, module, actionKey, approverRoles:[RoleName], isActive, isMandatory, createdAt, readOnly }`
RoleName is the string enum: Manager | CompanyAdmin | SuperAdmin (approvers only).

### Requests — /api/approvals (Bearer + Manager↑)
- `GET /pending` → inbox: pending requests this caller can act on (`canAct:true`)
- `GET /history` → all requests in scope (audit trail)
- `POST /{id}/approve` `{ comment? }` → 200; final step executes the action; status becomes Approved or ApprovedButFailed · 403 (self/insufficient role) · 409 (concurrent approver). **Body required** (send `{}` if empty) or 415.
- `POST /{id}/reject` `{ reason? }` → 200, status Rejected (terminates the chain)

ApprovalRequestDto: `{ id, companyId, actionKey, title, status, requesterEmail, ruleNameSnapshot, outcome?, createdAt, completedAt?, currentStepOrder?, canAct, steps:[{ order, requiredRole, status, actedByEmail?, comment?, actedAt? }] }`
status: Pending | Approved | Rejected | Cancelled | ApprovedButFailed
step status: Pending | Approved | Rejected | Skipped

## HR Module (Day 4) — all Bearer; company-scoped

SuperAdmin (CEO) has no company context, so HR **create** endpoints accept an optional `companyId`
(required for CEO; CompanyAdmin/Manager use their own). CreateEmployee, salary, status, and
ApplyLeave are **approvable** → HTTP 202 `{ pendingApproval:true, approvalRequestId }` when a rule matches.

### Departments — /api/departments
- `GET` (Employee↑) → DepartmentDto[] (with employeeCount) · `POST`/`PUT {id}`/`DELETE {id}` (CompanyAdmin↑; delete soft, blocked if active employees)
### Designations — /api/designations
- `GET` (Employee↑) sorted by level · `POST`/`PUT {id}`/`DELETE {id}` (CompanyAdmin↑)
### Employees — /api/employees
- `GET` (Manager↑) paged+filtered: `page,pageSize,search,departmentId,designationId,status,employmentType,includeInactive,sortBy,sortDir`; Manager → own dept
- `GET /me` (Employee↑) · `GET /{id}` (Manager↑) · `POST` (CompanyAdmin↑, approvable)
- `PUT /{id}` profile (Manager↑ own dept) · `PUT /{id}/salary` (CompanyAdmin↑, approvable, audited) · `PUT /{id}/status` (CompanyAdmin↑, approvable)
- Salary in DTO is null unless caller is CompanyAdmin↑ or the employee themselves
### Holidays — /api/holidays
- `GET?year=` (Employee↑) · `POST`/`DELETE {id}` (CompanyAdmin↑)
### Leave Types — /api/leave-types
- `GET` (Employee↑) · `POST`/`PUT {id}`/`DELETE {id}` (CompanyAdmin↑) · `POST /seed-defaults` (CompanyAdmin↑ — Annual/Sick/Unpaid/Maternity/Emergency)
### Leaves — /api/leaves
- `POST` (Employee↑, approvable HR.LeaveRequest; validates working days, overlap, balance) · `GET /me` · `GET /balance` (current-year balances) · `GET` (Manager↑ team/company) · `PUT /{id}/cancel` (owner or CompanyAdmin↑; returns days)

Approvable HR ActionKeys (in rule-builder under module "HR"): `HR.CreateEmployee`, `HR.SalaryChange`, `HR.TerminateEmployee`, `HR.LeaveRequest`.

## Accounting Module (Phase 2) — all Bearer; company-scoped

Gated by **`[RequireAccountingAccess]`** = CompanyAdmin & above, **or** a Manager who heads an
Accounting-**function** department (`GET /api/accounting/my-access` → `{ hasAccountingAccess }` mirrors
this to the FE). The company must have the **Accounting** module active (`PUT /api/companies/{id}/modules`
with `["...","Accounting"]`) and a seeded chart. A CEO (no company) passes `companyId` on writes; on
**reports** a CEO may **omit** `companyId` for a **consolidated** (tenant-wide) view. **Money postings**
are approvable → HTTP **202** `{ pendingApproval, approvalRequestId }` when a rule matches.

### Ledger — /api/accounting
- **Accounts:** `GET /accounts?companyId=&includeInactive=` · `POST /accounts` · `PUT /accounts/{id}` ·
  `POST /accounts/seed` `{ companyId?, industry }` (General/Trading/Construction/Staffing/Software —
  seeds chart + settings + tax) · `POST /accounts/opening-balances`
- **Journals:** `GET /journals` · `GET /journals/{id}` · `POST /journals` `{ companyId?, date,
  description, currency?, exchangeRate?, lines:[{accountId, debit, credit, contactId?, description?}] }`
  *(approvable `Accounting.ManualJournal`)* · `POST /journals/{id}/void`
- **Fiscal:** `GET/POST /fiscal-years`, `POST /fiscal-years/{id}/close`, `PUT /fiscal-years/periods/{id}` `{ isClosed }`

### Sales — /api/accounting
- **Contacts:** `GET/POST /contacts`, `PUT /contacts/{id}` (Code, Name, ContactType, TaxNumber…)
- **Invoices:** `GET /invoices` · `GET /invoices/{id}` · `POST /invoices` `{ companyId?, contactId, date,
  dueDate?, currency?, exchangeRate?, notes?, lines:[{description, quantity, unitPrice, accountId?, taxRateId?}] }`
  (draft) · `POST /invoices/{id}/post` *(approvable `Accounting.PostInvoice`)* · `POST /invoices/{id}/void`
  · `GET /invoices/{id}/einvoice` → `{ fileName, format, xml, warnings[] }` (UBL 2.1 / PINT AE)
- **Payments:** `GET /payments` · `POST /payments` `{ companyId?, contactId, date, bankAccountId, method,
  currency?, exchangeRate?, allocations:[{invoiceId, amount}] }` *(approvable `Accounting.RecordPayment`)*
- **Credit notes:** `GET/POST /credit-notes`

### Purchases — /api/accounting
- **Bills:** `GET /bills` · `GET /bills/{id}` · `POST /bills` · `POST /bills/{id}/post`
  *(approvable `Accounting.PostBill`)* · `POST /bills/{id}/void`
- **Supplier payments:** `GET/POST /supplier-payments` *(approvable `Accounting.RecordSupplierPayment`)*
- **Debit notes:** `GET/POST /debit-notes`

### Tax / Banking / Currency / Assets — /api/accounting
- **Tax rates:** `GET/POST /tax-rates` (5% / 0% / Exempt seeded)
- **Bank accounts:** `GET/POST /bank-accounts`; reconciliation `GET /bank-accounts/{id}/reconciliation`,
  `PUT /bank-accounts/reconciliation/lines/{id}` `{ isReconciled }`
- **Exchange rates:** `GET /exchange-rates` · `POST /exchange-rates` `{ currencyCode, rateDate, rate }` ·
  `DELETE /exchange-rates/{id}` · **`POST /exchange-rates/revalue`** `{ asOfDate }` (period-end unrealized FX)
- **E-invoicing settings:** `GET/PUT /einvoicing/settings` (seller legal name, TRN, address)
- **Fixed assets:** `GET/POST /fixed-assets`, `POST /fixed-assets/run-depreciation` `{ year, month }`

### Reports — /api/accounting/reports (CEO may omit companyId → consolidated)
`GET /trial-balance` · `GET /profit-and-loss?from=&to=` · `GET /balance-sheet?asOf=` · `GET /dashboard`
· `GET /aged-receivables` · `GET /aged-payables` · `GET /vat-return?from=&to=` · `GET /cash-flow?from=&to=`
· `GET /general-ledger?accountId=&from=&to=`. Each takes an optional `companyId`.

**Approvable Accounting ActionKeys** (rule-builder module "Accounting"; all support an optional
`amountThreshold` on the rule): `Accounting.PostInvoice`, `.PostBill`, `.RecordPayment`,
`.RecordSupplierPayment`, `.ManualJournal`, `.RunPayroll`. (Approval attaches to the **posting**, not
draft creation.) `ApprovalRuleDto` gained `amountThreshold?: number|null`; the registry's action DTO
gained `supportsAmountThreshold`.

## Accounting — TrueLedge port (Phase 2b) — all Bearer + `[RequireAccountingAccess]`; company-scoped (`companyId` optional for CompanyAdmin↑ / CEO)

Responses are the usual `ApiResponse<T>` envelope; enums serialise as strings; dates as `yyyy-MM-dd`.

### Vouchers — /api/accounting/vouchers
- `GET types` → `VoucherTypeDto[]` (F4 Contra, F5 Payment, F6 Receipt, F7 Journal, F8 Sales, F9 Purchase; prefix, mode, requiresParty)
- `GET ?from&to&voucherType&status&contactId&search&limit&offset` → `VoucherRegisterDto` (rows + totalCount + totalBaseAmount)
- `GET {id}` → `VoucherDto` (header, lines with account/cost-centre names, journal link)
- `POST` `SaveAndPostVoucherCommand` `{ voucherType, voucherDate, contactId?, currency?, exchangeRate?, reference?, narration?, placeOfSupply?, dueDate?, supplyDate?, saveAsDraft?, lines:[{ accountId, drCr?, amount?, quantity?, unitPrice?, discountPct?, taxRateId?, productId?, costCentreId?, description? }] }`
  → 200 `VoucherDto` (Posted, or Draft when `saveAsDraft`) · 202 when an approval rule (`Accounting.PostVoucher`) intercepts
- `PUT {id}` same body — update-and-post an existing Draft/Submitted voucher in place
- `POST {id}/reverse` `{ reason, reversalDate? }` → voucher Reversed + reversal journal · `POST {id}/cancel` (Draft only)

### Cost centres — /api/accounting/cost-centres
- `GET dimensions` · `POST dimensions` · `PUT dimensions/{id}` (`UpsertCostCentreDimensionCommand`)
- `GET ?dimensionId&includeInactive` → tree-ready list · `POST` · `PUT {id}` (`UpsertCostCentreCommand`) · `DELETE {id}` (409 when children/journal lines exist)
- `GET report?dimensionId&from&to` → per-centre debit/credit/net/lineCount

### Bank statements — /api/accounting/bank-statements
- `GET ?bankAccountId` · `GET {id}` (statement + lines + match state)
- `POST preview` (multipart `file`) → parsed lines, detected bank, totals, skipped rows — nothing stored
- `POST import` (multipart `file` + `bankAccountId`, optional `statementDate/openingBalance/closingBalance`) → statement (duplicates by fingerprint skipped) + auto-suggest
- `POST {id}/suggest` · `GET lines/{lineId}/candidates` · `POST lines/{lineId}/confirm {journalLineId}` · `POST lines/{lineId}/unmatch` · `POST lines/{lineId}/ignore`
- `GET rules` · `POST rules` · `PUT rules/{id}` · `DELETE rules/{id}` (`UpsertBankMatchRuleCommand`: pattern regex, patternField, targetAccountId?, targetContactId?, priority)

### AI document inbox — /api/accounting/documents (requires `Gemini:ApiKey`; otherwise `extractionAvailable=false`)
- `GET ?status&kind&search&limit&offset` · `GET {id}` (`InboxDocumentDetailDto`: file meta, extraction JSON, field suggestions) · `GET {id}/file` (bytes)
- `POST` (multipart `file`, `kind`, `tags?`, `extractNow?`) · `POST {id}/extract`
- `PUT {id}/fields` `{ fieldName, value }` (one user override per call; `finalValue` recomputed) · `POST {id}/accept` `{ voucherId }` — links the voucher the UI created from the suggestions via `POST /vouchers`; document → Accepted · `POST {id}/reject { reason? }`

### Ledger reports (SQL) — /api/accounting/ledger-reports (CEO may omit companyId)
- `GET balance-sheet?asOf` · `GET trial-balance?from&to` · `GET ledger-statement/{accountId}?from&to&costCentreId` · `GET bank-reconciliation/{bankAccountId}?asOf`
  — payloads are TrueLedge's camelCase report shapes (`BalanceSheetResult`, `LedgerStatement`, …)
- `GET export?reportType=BalanceSheet|Ledger|Transactions|TrialBalance&format=Pdf|Xlsx&asOf&accountId&from&to&voucherType&status&contactId&costCentreId&search`
  → file download (`Content-Disposition: attachment`)

### Periods (extended) — `PUT /api/accounting/fiscal-years/periods/{id}`
Body now accepts `closeStatus: Open|SoftClosed|HardClosed` in addition to legacy `isClosed`. CompanyAdmin↑ only;
hard-closing via `closeStatus` requires earlier periods of the year to be closed.

## UserDto
`{ id, email, firstName, lastName, fullName, role (string name, e.g. "CompanyAdmin"), tenantId?, companyId?, isActive, lastLoginAt?, createdAt }`

## JWT claims
`sub` (user id), `email`, `firstName`, `lastName`, `role` (name), `role_value` (number), `tenantId?`, `companyId?`, `exp` (15 min). Refresh token: 7 days, opaque, DB-stored.
