# Xorva — Platform Redesign: Independent Modules + Dynamic Sub-Modules

**Status:** Design proposal (for lead review)
**Author:** Engineering
**Date:** 2026-08-18
**Scope:** Backend + Frontend + Data model architecture to evolve Xorva from a _code-defined ERP_ into a _metadata-driven multi-tenant SaaS platform_.

---

## 📌 Progress Log (for review)

### ✅ Done today (18 Aug) — Analysis & Design phase

Before changing a live, working system, the correct first step is to study it and design the change. That is what today produced:

1. **Full system audit** — went through the backend, frontend and database to identify _exactly why_ our modules (HR, Accounting) cannot run independently yet. The specific blockers are listed in **§2.2** below (modules are wired together at compile-time; the module-active check is duplicated in ~30 places; no dynamic-forms engine exists yet).
2. **Confirmed our head-start** — verified that per-company module subscription _already exists_ in the data model (**§2.1**), so we are extending a working foundation, not starting from zero.
3. **Wrote this full architecture design** (§3–§5) — the target model for:
   - modules that run **independently** and can be **turned on/off per client**,
   - a client choosing and **paying for only the modules they want**,
   - **Admins creating their own sub-modules and forms** (like HR's Departments/Leave) **without a developer** —
     delivered as a **safe, staged plan** (§4) that never breaks the working Accounting / HR / Approval foundations.

### ➡️ Next (19 Aug) — Implementation, Phase A1

1. Build the module plug-in contract (`IModule`) + the `ModuleRegistry` that discovers modules automatically at startup.
2. Convert the **HR** module to register itself through it — behaviour identical, all tests still passing.
3. Add a module-catalog endpoint so the frontend can list the subscribable modules dynamically.
4. **Proof to demo:** a module wiring itself in with **zero edits** to the shared database context or startup file — the concrete evidence that modules are now independent.

> The sections below are the detailed engineering design behind the summary above.

---

## 1. What the business asked for

From the leads' review, four requirements:

1. **À la carte modules** — a tenant selects (and pays for) only the modules they want; each module is optional.
2. **Modules run independently** — a module can be turned on/off cleanly, owns its own data and logic, and does not require touching other modules to add a new one.
3. **Dynamic forms** — data-entry forms are not all hard-coded; they can be defined as configuration.
4. **Admin-defined sub-modules** — SuperAdmin and tenant Admin can add their own sub-modules (the way HR ships with Departments, Leave, Designations, Holidays, Payroll) **without a developer and without a deployment.**

This document is the honest gap analysis + the target architecture + a staged plan.

---

## 2. Where we are today (honest baseline)

### 2.1 What already supports the vision ✅

- **Per-company module subscription already exists.** `Company.ActiveModules` (a PostgreSQL `text[]`) stores the module keys a company has enabled, validated against `ModuleCatalog` (HR, Accounting, Sales, Purchasing, Inventory, Payroll, POS, Reports).
- **Activation is already enforced.** `AccountingGuard.EnsureAccountingActiveAsync` / `HrGuard` block access when a module is not active. The onboarding wizard already lets a new tenant pick modules.
- **Clean layering + CQRS.** Modules reference `Core` only; every feature is a MediatR Command/Query + Handler + Validator. Multi-tenancy is enforced at the ORM level with global query filters. **This is the pillar we keep.**

### 2.2 What blocks the vision ❌

| #   | Gap                                                                                                                                        | Evidence                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **Modules are compile-time coupled**, not independent. Adding a module means hand-editing central files.                                   | `XorvaDbContext` lists every module's `DbSet` and imports every module namespace; `Program.cs` hardcodes one validator-scan + `AddXModule()` per module. |
| G2  | **Activation enforcement is copy-pasted**, not centralized.                                                                                | `EnsureAccountingActiveAsync` is called by hand in ~30 handlers; HR repeats its own guard.                                                               |
| G3  | **Module structure is inconsistent.**                                                                                                      | Accounting is sliced by sub-domain (Sales/Purchases/Ledger…); HR is a flat `Commands/` dump.                                                             |
| G4  | **Subscription is per-company, not per-tenant/plan.** No billing plan, no tenant-level entitlement, no module catalog/marketplace surface. | `ActiveModules` lives only on `Company`.                                                                                                                 |
| G5  | **No dynamic-forms engine at all.**                                                                                                        | Grep for custom-field / field-definition / entity-definition metadata → **0 results.** Every form is hand-written TSX.                                   |
| G6  | **Admins cannot add sub-modules.** HR's five sub-areas are hard-coded entities + pages.                                                    | No metadata-driven entity concept exists.                                                                                                                |

**Bottom line:** we have a well-built _fixed_ ERP with a subscription toggle. The leads want a _platform_. That is a real architectural pivot — but it is stageable, and the subscription foundation means we are not starting from zero.

---

## 3. Target architecture

Two capabilities, built in this order: **(A) a Module Kernel** so modules are genuinely independent, then **(B) a Dynamic Entity Engine** so Admins can create sub-modules as configuration.

### 3.1 Principle: hybrid, not "everything dynamic"

This is the key senior-engineering judgement, and the one to defend to the leads:

> **Rich logic stays as code. The long tail of simple record-keeping becomes metadata.**

- **Code modules ("packs")** — HR, Accounting. They contain real logic (double-entry posting, payroll/gratuity, leave balances, approvals). Rebuilding these as generic metadata would be slower, buggier, and unmaintainable. They stay code — but become _self-registering plugins_.
- **Dynamic sub-modules** — tenant-defined entities (e.g. "Asset Register", "Training Records", "Site Visits", "Vehicle Log"). These are 80% of what an Admin actually wants to "add themselves" and they are pure CRUD. These become **configuration**, no deployment.

Industrial precedent: this is exactly how **Odoo** (code modules + _Studio_), **Salesforce** (managed packages + _Custom Objects_), and **Zoho Creator** work. We are following a proven pattern, not inventing one.

### 3.2 Capability A — the Module Kernel (independence)

Introduce a plugin contract in `Core`:

```csharp
public interface IModule
{
    string Key { get; }                       // "HR", "Accounting"
    string DisplayName { get; }
    string[] DependsOn { get; }               // e.g. Payroll depends on ["HR","Accounting"]
    void RegisterServices(IServiceCollection services, IConfiguration config);
    void RegisterEntities(ModelBuilder modelBuilder);   // module owns its DbSets + configs
    IEnumerable<NavItem> Navigation(ModuleContext ctx); // module owns its sidebar
    IEnumerable<ApprovableActionDescriptor> ApprovableActions { get; }
}
```

- A `ModuleRegistry` discovers all `IModule` implementations at startup (assembly scan) and wires them. **Adding a module = drop in a project that implements `IModule`. No edits to `XorvaDbContext` or `Program.cs`.** (Fixes G1, G3.)
- `XorvaDbContext.OnModelCreating` loops the registry and calls `RegisterEntities` on each — instead of a hardcoded list of 20+ `DbSet`s.
- Replace the scattered `EnsureXActiveAsync` guards with **one** `ModuleAccessBehavior<TRequest>` in the MediatR pipeline: a request tagged `[RequiresModule("HR")]` is checked once, centrally. (Fixes G2.)
- **Entitlements move up to the tenant.** Add `TenantSubscription` (plan + enabled module keys + limits); `Company.ActiveModules` becomes "which of the tenant's paid modules this company uses." Add a **Module Catalog / marketplace** screen. (Fixes G4.)

### 3.3 Capability B — the Dynamic Entity Engine (admin sub-modules + dynamic forms)

Metadata tables (all tenant-scoped, so every tenant designs their own):

| Table              | Purpose                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EntityDefinition` | A custom sub-module: key, label, icon, owning module, scope (tenant/company), permissions.                                                           |
| `FieldDefinition`  | A field on an entity: key, label, data type (text/number/date/select/bool/lookup/currency/file), required, options, validation rules, display order. |
| `CustomRecord`     | An actual row: `EntityDefinitionId` + `TenantId`/`CompanyId` + `Data` (JSONB). One table serves all custom entities.                                 |

- **Generic backend:** one `CreateRecord` / `UpdateRecord` / `ListRecords` / `DeleteRecord` handler set works for _any_ `EntityDefinition`. Validation is generated from `FieldDefinition` rules at runtime. Records still flow through the same tenant filters, audit, and (optionally) approval pipeline — so custom data gets the same governance as code entities.
- **JSONB storage** means no schema migration when an Admin adds a field. PostgreSQL can index inside JSONB (GIN) if a field needs to be filtered/sorted at scale.

**Frontend (dynamic rendering):**

- `<DynamicForm definition={…}/>` — renders inputs by field type, wires validation, submits to the generic endpoint. Reuses the existing `Field`/`SelectField`/`Modal` primitives (so custom forms look native).
- `<DynamicList definition={…}/>` — renders a table/columns from field metadata, with search + paging (reusing existing patterns).
- `<FormBuilder/>` (Admin only) — drag/drop or add-field UI to design an `EntityDefinition`; writes the metadata.
- **Nav integration:** custom sub-modules appear in the sidebar automatically under their parent module, gated by the same RBAC + module-subscription checks.

### 3.4 How HR's "5 things + admin can add more" works end-to-end

- Department, Leave, Designation, Holiday, Payroll **stay as code** (they carry real logic).
- An Admin who wants a 6th sub-module — say "Employee Training Records" — opens **HR → Manage sub-modules → New**, defines fields (Course, Date, Trainer, Result, Certificate file), and it appears in the HR sidebar with a working list + form + approvals — **no developer, no deploy.** That is precisely the leads' request, delivered by Capability B.

---

## 4. Staged roadmap (safe, pillar-preserving)

Each phase ships green (tests passing) and is committed before the next. Nothing below rewrites the working Auth/Tenant/Approval/ledger pillars — it is additive + a contained refactor.

| Phase  | Deliverable                                                                                                                     | Risk                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **A1** | `IModule` contract + `ModuleRegistry` + refactor **one** module (HR) to self-register; keep behaviour identical, tests green.   | Med — touches DbContext wiring; done additively behind the registry. |
| **A2** | Refactor Accounting to self-register; delete hardcoded lists from `XorvaDbContext`/`Program.cs`; single `ModuleAccessBehavior`. | Med                                                                  |
| **A3** | `TenantSubscription` + plan/entitlements + **Module Catalog** screen (subscribe/unsubscribe).                                   | Low                                                                  |
| **B1** | `EntityDefinition`/`FieldDefinition`/`CustomRecord` + generic CRUD/validation handlers (backend only, API-tested).              | Low — brand-new tables, touches nothing existing.                    |
| **B2** | `DynamicForm` + `DynamicList` renderers; wire one custom entity end-to-end.                                                     | Low                                                                  |
| **B3** | `FormBuilder` (admin designer) + sidebar auto-registration + per-entity RBAC.                                                   | Med                                                                  |
| **C**  | Polish: approval integration for custom records, import/export, pre-built industry sub-module templates.                        | Low                                                                  |

**Frontend track (parallel):** adopt React Query for server-state (a data-fetching library is already installed but unused across 43 pages that hand-roll `useEffect`), split the 683-line `accounting.api.ts`, and lazy-load routes — so the platform UI is consistent and fast before we pile dynamic screens on top.

---
