# Xorva — Build Sequence: What to Build First

**Status:** Execution plan (senior-architect review of the actual codebase)
**Date:** 2026-08-19
**Companion to:** `PLATFORM_MODULAR_REDESIGN.md` (the *why* + target design). This doc is the *order of work* — grounded in reading the real files, not memory.

---

## 0. The one architectural key I confirmed in the code

Everything below hinges on a pattern **that already works in your codebase**, so we are extending a proven idea, not inventing one:

- **`IJournalPoster`** lives in `Xorva.Core/Interfaces`. HR payroll posts a salary journal into Accounting **through this Core contract** — `PostPayRun.cs` depends on `IJournalPoster`, and *HR never references the Accounting project.* (`PayRun.cs` comment: "HR never references Accounting.")
- This is **inversion of dependency**: the module needs a *capability*, declared as an interface in Core; whichever module implements it plugs in at runtime.

**The knot for splitting CRM/Sales out of Accounting:** Sales and Purchases read the `Contact` entity directly — `_db.Set<Contact>()` appears in **20+ handlers** (CreateInvoice, PostInvoice, CreateBill, RecordCustomerPayment, ListInvoices…). So to make CRM its own module we introduce **`IContactDirectory`** in Core (GetById / ListByCompany / name lookups), exactly mirroring `IJournalPoster`. Sales then depends on the *contract*, not on CRM.

> **"Independent AND dependent" — solved:** each module installs on its own; when two are both installed they integrate through the Core contract. If Accounting is not installed, Sales still records an invoice but simply has no `IJournalPoster` to post it to the ledger (handled gracefully). That is precisely the model you asked for.

---

## 1. Target module map (the restructure)

| Module | Owns (entities) | Depends on — via **Core contract** only |
|--------|-----------------|------------------------------------------|
| **CRM** *(new — carved out)* | `Contact` (customer / supplier / lead), later Lead, Opportunity, Activity | — |
| **Sales** *(new — carved out)* | `Invoice`, `InvoiceLine`, `CreditNote`, `CustomerPayment`, `Product` | `IContactDirectory` (CRM), `IJournalPoster` (Accounting) |
| **Purchasing** *(new — carved out)* | `Bill`, `DebitNote`, `SupplierPayment` | `IContactDirectory`, `IJournalPoster` |
| **Accounting** *(slimmed to the finance core)* | Ledger, Journals, Tax, Banking, Fiscal, Fixed Assets, Currency, Reports, E-Invoicing | *(implements `IJournalPoster`, `IContactDirectory` optional)* |
| **HR** *(already ~independent)* | Employee, Department, Designation, Leave, Holiday, Payroll | `IJournalPoster` (payroll only) |
| **Platform / Studio** *(new engine)* | `EntityDefinition`, `FieldDefinition`, `CustomRecord` | — (used by every module for admin-defined sub-modules) |

Today **"Accounting" is really 5 modules in one project** (Ledger + Sales + Purchasing + CRM-contacts + Tax/Bank/Assets). Splitting it is the bulk of the structural work — but it is *mechanical* once the contracts and the kernel exist.

---

## 2. Recommended order — and WHY this order

The sequence is chosen for **lowest risk × highest leverage first**, and so each step makes the next one easier. Do not start with the module split — without the kernel, adding *more* modules multiplies today's hardcoded wiring pain.

### ▶ STEP 1 — Module Kernel (the foundation) — *start here*
**What:** an `IModule` plug-in contract + a `ModuleRegistry` that discovers modules at startup, so `XorvaDbContext` and `Program.cs` stop hard-listing every module.
**Why first:** every later step (more modules from the split, tenant subscription, dynamic-module nav) sits on top of this. Building the splits *before* this means editing the shared context 3 more times. Small and contained.
**Effort:** 1–2 days. **Risk:** Medium (touches startup wiring — done additively behind the registry, tests stay green).
**Proof to show:** a module wiring itself in with **zero edits** to `XorvaDbContext` / `Program.cs`, plus a `GET /api/modules/catalog` that lists modules from the registry.

### ▶ STEP 2 — Dynamic Entity Engine (admin-defined sub-modules + dynamic forms)
**What:** three new tables — `EntityDefinition`, `FieldDefinition`, `CustomRecord` (JSONB) — + generic CRUD/validation handlers + a `DynamicForm` / `DynamicList` renderer + an admin `FormBuilder`.
**Why second:** this is the **highest-visibility win and the lowest risk** — brand-new tables that touch *nothing* existing — and it directly delivers two of the leads' four asks ("admin adds new things inside a module" + "dynamic forms"). Great to demo.
**Effort:** ~1 week. **Risk:** Low.
**Proof to show:** live, an Admin creates a new HR sub-module ("Training Records": Course, Date, Trainer, Result, Certificate file) — it appears in the sidebar with a working list + form — **no code, no deploy.**

### ▶ STEP 3 — Carve out CRM (Contacts) — the first real split
**What:** move `Contact` into a new `Xorva.Modules.CRM`; add `IContactDirectory` to Core; repoint the 20+ Sales/Purchases lookups to the contract.
**Why third:** proves the split pattern on the *smallest* boundary before the big ones. Once this works, Sales/Purchasing are the same move, repeated.
**Effort:** 2–3 days. **Risk:** Medium.

### ▶ STEP 4 — Carve out Sales, then Purchasing
**What:** move Invoice/CreditNote/CustomerPayment/Product → `Sales`; Bill/DebitNote/SupplierPayment → `Purchasing`. Both consume `IContactDirectory` + `IJournalPoster`. Accounting is left as the clean finance core.
**Effort:** ~1 week. **Risk:** Medium (mechanical once Step 1 + 3 exist).

### ▶ STEP 5 — Tenant subscription + module marketplace
**What:** lift entitlement to the tenant (`TenantSubscription` = plan + paid module keys); a catalog screen to subscribe/unsubscribe; central `[RequiresModule]` enforcement replacing the ~30 copy-pasted guards.
**Effort:** 2–3 days. **Risk:** Low.

### ▶ STEP 6 — Frontend consistency pass
Adopt the already-installed React Query (43 pages hand-roll fetching today), split the 683-line `accounting.api.ts`, lazy-load routes, and drive the sidebar from the module registry so custom sub-modules appear automatically.
**Effort:** ~1 week. **Risk:** Low.

---

## 3. What to start RIGHT NOW (Step 1, concrete)

1. `Xorva.Core/Modules/IModule.cs` — the contract (Key, DisplayName, Description, DependsOn, IsCore, Order, Assembly, `RegisterServices`).
2. One `*Module.cs` per existing module (Auth, Tenants, Approvals, HR, Accounting) that self-declares metadata and calls its existing `AddXModule()`.
3. `Xorva.Infrastructure/Modules/ModuleRegistry.cs` — discovers the modules and drives registration + validator scanning.
4. Refactor `Program.cs` to loop the registry instead of the 5 hardcoded `AddXModule()` + 5 validator lines.
5. `ModulesController` → `GET /api/modules/catalog`.
6. `dotnet build` + run the test suite green.

This is **additive** — the old `AddXModule()` methods stay and are called *by* the manifests, so behaviour is identical and nothing is at risk. It is the safe first brick.

---

## 4. Plain-English: what "JSONB" means (for the dynamic engine)

JSONB is a PostgreSQL column type that stores a **JSON document** inside one database cell, and the database can index and query *inside* it.

Why it matters here: when an Admin adds a custom sub-module with fields (Course, Trainer, Result…), we do **not** create a new database table or run a migration each time. Every custom record is one row in `CustomRecord` whose `Data` column holds `{ "course": "...", "trainer": "...", "result": "..." }` as JSONB. Add a field → it's just another key in the JSON. That is what makes "Admins add their own forms without a developer" physically possible without touching the schema.

---

## 5. Summary for leadership (one line)
We build the **plug-in kernel first** (so modules are independent), then the **dynamic engine** (so Admins add their own sub-modules and forms — the visible win), then split the oversized Accounting module into **CRM / Sales / Purchasing / Accounting** using the same proven Core-contract pattern that already lets HR post into Accounting today — each step tested and safe, nothing rewritten.
