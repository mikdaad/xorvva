# Xorva — SaaS Platform Architecture & Roadmap

> **Status:** Design locked for discussion • **Date:** 2026-07-28
> **Author:** Architecture review (grounded in the actual codebase, not theory)
>
> This document answers one question: *"How do we make Xorva ONE app that any
> company — Tadbeer agency, construction, restaurant, logistics — can use, and it
> feels made for them, while some buy only HR, only Payroll, only CRM?"*
>
> Every claim below was checked against real files. File references are clickable.

---

## 1. The core problem (in the client's words)

When we sit with a client, their operations, suppliers, services, and forms are all
**different and custom**. If we hard-code the software for one client, we cannot reuse
it for the next. We want **one engine + industry templates** — the model every
successful SaaS ERP uses (Odoo, SAP, Zoho, Salesforce). But:

1. Every company's entities/forms/flows differ → how do we avoid building 20 apps?
2. Some companies want **only** HR, or **only** Payroll, or **only** CRM — but in an
   ERP everything is connected. How does à la carte work?
3. HR has employees but no task/work assignment. Is that an architecture problem?

This doc gives the honest answer to all three and a staged build plan.

---

## 2. The honest current state (from the code)

**Verdict: We have built an excellent STATIC multi-tenant ERP. We have NOT started
the DYNAMIC (no-code) engine. Those are two different things.**

### 2.1 What is already built and correct ✅

| Capability | Where it lives | Grade |
|---|---|---|
| **Tenant → Company → Branch** hierarchy | [CompanyEntity.cs](../backend/Xorva.Core/Entities/CompanyEntity.cs), [Tenant.cs](../backend/Xorva.Core/Entities/Tenant.cs), [Company.cs](../backend/Xorva.Core/Entities/Company.cs) | Real SaaS-grade |
| **Tenant isolation + cross-company visibility** via global query filters | `CompanyEntity` / `TenantEntity` base classes | Correct security boundary |
| **Per-company module on/off** (`Company.ActiveModules`, a Postgres `text[]`) | [ModuleCatalog.cs](../backend/Xorva.Core/Constants/ModuleCatalog.cs), [SetCompanyModulesCommandHandler.cs](../backend/Modules/Xorva.Modules.Tenants/Commands/SetCompanyModules/SetCompanyModulesCommandHandler.cs) | The first brick of à la carte |
| **Modules decoupled** — HR references only Core, not Accounting | HR `.csproj` → only `Xorva.Core` | Textbook |
| **Cross-module calls via Core interfaces (dependency inversion)** | [IJournalPoster.cs](../backend/Xorva.Core/Interfaces/IJournalPoster.cs), `IUserProvisioningService` | The seam that makes à la carte possible |
| **Document → posting → ledger** pattern proven 5× | [Invoice.cs](../backend/Modules/Xorva.Modules.Accounting/Sales/Entities/Invoice.cs) + Bill/CreditNote/DebitNote/Payments | Pattern ready to generalize |
| **Per-company posting map + number sequences** | [AccountingSettings.cs](../backend/Modules/Xorva.Modules.Accounting/Ledger/Entities/AccountingSettings.cs) | Proof we already "config-drive" documents |
| **Workflow/approval engine** (dynamic action registry) | `Xorva.Modules.Approvals`, `IApprovableActionRegistry` | Real state machine |
| **MediatR in-process bus** | throughout (CQRS) | Event backbone already present |

**This is the expensive foundation. Multi-tenancy is the hardest part of any SaaS and
it is built correctly.**

### 2.2 What does NOT exist yet ❌ (proof, not opinion)

A full-repo search for `jsonb`, `CustomField`, `EntityDefinition`, `FieldDefinition`,
`DynamicForm`, `LabelOverride`, `Terminology`, `schema`, `renderField` returned
**zero matches**. Confirmed gaps:

| The dynamic vision needs… | Have? | Reality today |
|---|---|---|
| **Custom fields** (a company adds "Passport No." with no code) | ❌ | Every field is a fixed C# property + migration |
| **Entity/Document definitions as DATA** | ❌ | `Invoice`, `Contact`, `Employee` are hard-coded classes |
| **Generic Document engine** (one engine, many doc types) | ❌ | Copy-pasted 5× |
| **Dynamic forms** (screen builds itself from config) | ❌ | Every page hand-coded — [InvoicesPage.tsx](../frontend/src/pages/accounting/InvoicesPage.tsx) is 358 lines; one file per entity |
| **Label / terminology override** ("Supplier"→"Agency") | ❌ | Labels hard-coded in [navConfig.ts](../frontend/src/components/shell/navConfig.ts) + each page |
| **Template / industry packs** | ❌ | Only `SeedChartOfAccounts` (accounting-only) |
| **Generic setting cascade** (tenant→company→branch) | ⚠️ partial | Typed settings only (`AccountingSettings`) |
| **Module dependency handling** when a dep is OFF | ❌ | `SetCompanyModules` validates keys but does not expand dependencies |
| **Billing / plan → module mapping** (to *sell* per module) | ❌ | Not found in the codebase |
| **Tasks / work assignment** | ❌ | Feature gap |

### 2.3 Scorecard — "is Xorva a real SaaS yet?"

- **Multi-tenant platform foundation: ~70–80% done.** ✅
- **À la carte modularity: ~80% (bones right, safety layer missing).** ⚠️
- **Dynamic no-code engine: ~5–10% done.** ❌ ← the bulk of remaining work
- **Billing to sell modules: ~0%.** ❌

**Nothing here says "rebuild." Everything says "add, in the right order."**

---

## 3. Target architecture — the HYBRID (this is the whole strategy)

Do **not** make Accounting/HR/Payroll "dynamic." Money and payroll are the *same* for
every company — hard-coding them is *correct* (even Odoo/Salesforce keep accounting
coded). The dynamic engine is only for the **industry layer**.

```
┌───────────────────────────────────────────────────────────────┐
│  VERTICAL PACKS   (Tadbeer · Construction · Restaurant …)      │  ← data only, no code
├───────────────────────────────────────────────────────────────┤
│  DYNAMIC ENGINE  (the new build)                              │
│  entity defs · custom fields · document engine · forms ·      │
│  labels · setting cascade                                     │
├───────────────────────────────────────────────────────────────┤
│  STATIC CORE  (already built — keep as-is)                    │
│  Accounting ✓ · HR/Payroll ✓ · Approvals ✓ · Contacts ✓       │
├───────────────────────────────────────────────────────────────┤
│  MODULE FABRIC   manifest · dependencies · interface seams ·  │
│                  MediatR events · no-op fallbacks             │
├───────────────────────────────────────────────────────────────┤
│  PLATFORM   Tenant/Company/Branch ✓ · RBAC ✓ · Neon Postgres  │
└───────────────────────────────────────────────────────────────┘
```

**Static core + dynamic industry layer, both standing on the platform you already
have.** The two layers talk through the same Core interfaces payroll already uses.

---

## 4. Part A — The config cascade (tenant → company → branch)

Configuration is **not** global. It attaches to a level and lower levels
**inherit then override** (like CSS). One small table drives labels, settings, and
pack output:

```
Setting {
  Scope     : Tenant | Company | Branch      -- enum
  ScopeId   : Guid                            -- which tenant/company/branch
  Key       : string   -- e.g. "label.supplier", "doc.purchase.workflow", "vat.default"
  Value     : jsonb
}
```

**Resolution:** to render for a company, pull settings where
`Scope=Tenant AND tenant` OR `Scope=Company AND company` OR `Scope=Branch AND branch`,
then merge in that order — **most specific wins**. Applying an industry pack = writing a
batch of `Company`-scope settings. `CurrentTenantService` already carries tenant +
company + role per request, so resolution has everything it needs.

**Rule of thumb for what lives where:**
- **Tenant** — login, billing, branding, currency/VAT defaults.
- **Company** — the pack, labels, custom fields, workflows, its books & data.
- **Branch** — address, local approval limits.

---

## 5. Part B — À la carte modules (HR only / Payroll only / CRM only)

### 5.1 What already works
Deploy **all** modules; `Company.ActiveModules` decides what each company sees and
uses. This is the correct SaaS model (do **not** physically remove code per client).
Modules are decoupled (HR → only Core) and integrate through Core interfaces.

### 5.2 The real problem: dependencies when a module is OFF
There are only two kinds of connection between modules:

**HARD dependency** — cannot exist without it. *Payroll needs employees (HR).*
→ **Rule:** enabling a module auto-enables its hard deps.

**SOFT integration** — works alone, does more when the other is on. *Payroll computes
payslips without Accounting; it only needs Accounting to post the salary journal.*
→ **Rule:** call through the interface + register a **no-op fallback** when the
provider is off.

```
Accounting ON   → real JournalPoster  → salary journal hits the ledger
Accounting OFF  → NoOpJournalPoster    → payslip still works, no GL entry, no crash
```

> ⚠️ **Live bug this fixes:** [PostPayRun.cs](../backend/Modules/Xorva.Modules.HR/Commands/PostPayRun/PostPayRun.cs)
> injects `IJournalPoster`. If a company runs Payroll with Accounting off, DI cannot
> resolve it → runtime failure. The no-op fallback removes this.

### 5.3 The three things to add (the whole fix — small)

1. **Module manifest** — each module declares its needs:
   ```
   Payroll   : DependsOn=[HR],        EnhancedBy=[Accounting]
   Invoicing : DependsOn=[Contacts],  EnhancedBy=[Accounting]
   CRM       : DependsOn=[],          EnhancedBy=[Sales, Accounting]   ← standalone
   ```
2. **Auto-expand hard deps** in `SetCompanyModulesCommandHandler` (extend the existing
   `ValidateModules`) so turning on Payroll turns on HR.
3. **No-op fallbacks** for every cross-module interface, registered when the provider
   is off. Use **MediatR notifications** (already present) for "react-if-listening"
   events like `EmployeeHired`.

**Verdict: ~80% there. Add a manifest + fallbacks. Do NOT re-architect.**

---

## 6. Part C — The dynamic engine (the big build)

Everything a company customizes = **data**, rendered by a generic engine.

### 6.1 Metadata (the "definitions")
```
EntityDefinition {            -- "Domestic Worker", "Vehicle", "Contract"
  CompanyId, Key, Label, Icon, IsDocument (bool)
}
FieldDefinition {             -- columns of that entity
  EntityDefinitionId, Key, Label, Type (text|number|date|select|ref|money),
  Required, Options (jsonb), RefEntityKey, Sort
}
```

### 6.2 Storage — two lanes (pragmatic, not dogmatic)
- **Core entities** (Invoice, Employee, Contact): add one `CustomFields jsonb` column
  for company-specific extras. No migration per client.
- **Fully custom entities** (Domestic Worker, Vehicle): one generic table
  `DynamicRecord { EntityDefinitionId, CompanyId, Data jsonb, + audit }`. Metadata
  describes the shape; a **generic CRUD API** reads/writes by definition. This is the
  Salesforce/Airtable model and the *only* way to avoid "20 apps".

### 6.3 The Document engine (generalize what exists)
A document = **header + lines + totals + workflow + posting**. We already have this 5×;
generalize it:
```
DocumentType { CompanyId, Key, Label, PartyRole (Supplier|Customer),
               NumberFormat, HeaderFields[], LineColumns[], ItemSource, Workflow }
Document      { DocumentTypeId, CompanyId, Header jsonb, Status, Totals }
DocumentLine  { DocumentId, Data jsonb }   -- item, qty, price, tax, amount, account
```
**Posting reuses the existing seam:** `IJournalPoster` + `JournalDraft` already accept
a `SystemAccount` so a module that doesn't know the chart can still post correctly
(that's how payroll posts). A generic document's posting rule maps its lines →
accounts and calls the same `IJournalPoster`. **The dynamic engine plugs into your real
ledger with zero accounting rewrite.**


### 6.4 Dynamic form renderer (frontend)
Replace hand-coded pages with one renderer that reads the `EntityDefinition` /
`DocumentType` and builds the form + list + dropdowns. Add a field in config → it
appears on screen. No redeploy. (Static-core pages like the ledger stay hand-coded.)

### 6.5 Labels / terminology
A label map per company, resolved through the Part-A cascade. Frontend renders
`label("supplier")` → "Agency" for Right Source, "Dealership" for a car-rental company.

### 6.6 Template packs (the sales weapon)
A pack is a seed bundle that writes, scoped to a company: `EntityDefinition`s +
`FieldDefinition`s + `DocumentType`s + labels + default catalog + module activations.
Extends the existing `SeedChartOfAccounts` idea. **First pack = Tadbeer / Domestic
Worker** (reproducing the client's real screens) as the proof.

### 6.7 The honest 85/15 rule
~85% of a vertical = config (fields, columns, labels, workflow, posting). The last
~15% (a trial-period rule, recipe explosion, 3-way match) = a **small plugin/hook** on
that one document type. **Do not chase 100% no-code — that is the trap that turns a
product into an unfinishable platform.**

---

## 7. Part D — Tasks / Work module

**This is a missing feature, not an architecture flaw. The architecture is fine.**

Task/work management is *not* classic HR (employees, leave, payroll). Build it as a
**small new module** `Xorva.Modules.Work` that **DependsOn HR** (reuses `Employee` as
assignee). Bonus: it is the perfect first real test of the Part-B dependency pattern.

```
WorkTask : CompanyEntity {
  Title, Description, AssigneeId→Employee, DueDate, Priority,
  Status (Todo|InProgress|Done)
}
+ CreateTask / AssignTask / UpdateStatus commands + queries + one page
```

---

## 8. Part E — Billing / plan layer (to actually SELL modules)

To charge for "HR only" vs "full suite" we need subscription state (not found in the
codebase today):
```
Plan            { Key, Name, Price, IncludedModules[] }
TenantSubscription { TenantId, PlanId, Status, PeriodEnd }
```
`ActiveModules` per company must be **constrained by** the tenant's plan. This is
separate from architecture but **required before we can monetize modularity**.

---

## 9. Staged roadmap (ordered, honest sizes)

Sizes are relative to the Accounting module (~12 days of real work per its migrations).

| # | Stage | Size | Why this order |
|---|---|---|---|
| 0 | **Module manifest + hard-dep expansion + no-op fallbacks** | Small | Makes à la carte *safe*; fixes the PostPayRun bug |
| 1 | **Tasks/Work module** | Small | Real feature + proves the dependency pattern on something low-risk |
| 2 | **Setting + label cascade** (tenant→company→branch) | Small–Med | Foundation for packs & dynamic UI |
| 3 | **Custom fields (`jsonb`) on core entities + field editor** | Medium | Immediate "feels custom" win, low risk |
| 4 | **EntityDefinition + DynamicRecord + generic CRUD API** | **Large** | The heart of no-code entities |
| 5 | **Dynamic form/list renderer (frontend)** | **Large** | Screens build themselves from config |
| 6 | **Generic Document engine** (reuse `IJournalPoster`) | Medium–Large | Purchase/Sales/Contract without code |
| 7 | **Template pack loader + Tadbeer pack** | Medium | Proves the whole engine against a real client |
| — | **Billing / plan layer** | Medium | Parallel track; needed before selling per-module |

**Honest bottom line:** Stages 0–3 are quick wins on your existing foundation.
Stages 4–6 are your single biggest build so far — bigger than Accounting — and are the
real cost of the "any-industry" vision. At your demonstrated pace, a solid engine MVP
(through Stage 7) is realistically **~3–6 focused weeks**, not an afternoon and not a
year.

---

## 10. Guardrails (what we will deliberately NOT do)

1. **Do not rewrite the static core** (Accounting/HR/Payroll) to be dynamic.
2. **Do not aim for 100% no-code.** Accept the 15% plugin tail.
3. **Do not physically install/uninstall module code per tenant.** Feature-flag via
   `ActiveModules` (already correct).
4. **Do not let a "Payroll-only" company crash** because Accounting is off — no-op
   fallbacks are mandatory before shipping à la carte.

---

## 11. Open decisions (need the founder's call)

1. **Shared vs per-company contacts:** under one tenant, do companies share a customer/
   supplier list, or is each company's list isolated? (Affects the Party model.)
2. **Billing:** is any subscription/billing code already present that this review did
   not see? If not, when does monetization need to be live?
3. **Beachhead:** confirm **Tadbeer / Domestic Worker** as the first vertical pack (the
   client we already have) so Stage 7 targets a real, paying use case.
4. **Cloud-only or also self-hosted?** (Affects the dynamic engine's deployment story.)

---

*End of design. Every architectural claim maps to a real file in this repo; the
roadmap builds on what exists rather than replacing it.*
