XORVA Master Development Lifecycle
Objective
Build XORVA from the database security boundary upward so that every higher-level capability depends on a verified lower-level platform.
The development sequence is:
PostgreSQL → Multi-Tenancy/RLS → Metadata Model → Contract Compiler → Generic Data Runtime → Workflow Engine → API Execution Engine → Headless UI → Mobile Runtime → Audit/Observability → AI Command Plane → Hardening → Dockerization → Air-Gapped Distribution
The AI Command Plane is intentionally late in the lifecycle. Before AI generates a contract, XORVA must already be capable of safely validating, publishing, rendering, and executing a manually authored contract.
Phase 0 — Architecture Freeze and Engineering Foundation
Purpose
Establish the architectural invariants, repository boundaries, terminology, development standards, and acceptance criteria before implementation begins.
Task 0.1 — Define XORVA Architectural Invariants
Input
Existing XORVA architecture
Multi-tenant requirements
Air-gap requirements
Metadata-driven execution requirements
Work
Define non-negotiable platform rules covering:
tenant isolation;
contract immutability;
no arbitrary SQL execution;
no arbitrary JavaScript execution;
capability allowlisting;
contract versioning;
user identity propagation;
RLS enforcement;
auditability;
offline operation;
deterministic execution.
Output
Architecture Invariants document.
Done when
Every future architecture decision can be checked against a written set of platform invariants.
Task 0.2 — Define Core XORVA Terminology
Input
Architecture model
Metadata concepts
Work
Standardize terms such as:
Tenant
Module
Entity
Record
Relationship
Contract
Contract Version
Capability
Action
Workflow
Execution Primitive
Component Registry
Command Plane
Data Plane
Certified Extension
Output
Canonical XORVA glossary.
Done when
The database, API, UI, and AI teams use identical terminology.
Task 0.3 — Define Architecture Decision Record Process
Input
Architecture governance requirements
Work
Define how significant architecture decisions are documented.
Examples:
JSONB vs physical tables;
shared DB vs isolated DB;
workflow DSL design;
RPC design;
contract versioning;
authentication strategy.
Output
ADR template and ADR directory.
Done when
Major architectural changes cannot occur without an ADR.
Task 0.4 — Define Repository Boundaries
Input
Next.js
React Native
PostgreSQL/Supabase
Future Python AI system
Work
Define monorepo package boundaries.
Expected domains:
web application;
mobile application;
metadata specification;
contract compiler;
runtime SDK;
web component registry;
mobile component registry;
database;
AI builder;
deployment;
security;
tests.
Output
Approved repository architecture.
Done when
Every future component has a clearly defined ownership location.
Task 0.5 — Define Environment Strategy
Input
Deployment requirements.
Work
Define:
local development;
CI;
integration;
staging;
production SaaS;
dedicated enterprise;
sovereign/air-gap.
Output
Environment matrix.
Done when
Configuration differences between environments are explicitly known.
Task 0.6 — Define Phase 1 Proof-of-Concept Domains
Input
Metadata engine goals.
Work
Select two deliberately different domains.
Recommended:
Fleet Management
Audit Management
Output
Two reference domain specifications.
Done when
The platform must prove both applications run without domain-specific backend models/controllers.
Phase 0 Exit Gate
Proceed only when:
architectural invariants are approved;
terminology is frozen;
repository boundaries are established;
environment model is defined;
Fleet and Audit reference domains are selected.
Phase 1 — PostgreSQL and Supabase Foundation
Purpose
Create the core persistence layer before any dynamic execution behavior exists.
Task 1.1 — Establish PostgreSQL/Supabase Development Environment
Input
Repository
local development environment
Work
Create the database development lifecycle including:
local PostgreSQL/Supabase;
migration execution;
database reset;
seed execution;
database test execution.
Output
Repeatable local database environment.
Done when
A developer can recreate XORVA's database from zero deterministically.
Task 1.2 — Define PostgreSQL Schema Boundaries
Input
XORVA architecture.
Work
Separate logical schemas such as:
core;
metadata;
application data;
private/internal functions;
public API functions;
audit.
Output
Database namespace specification.
Done when
Every table/function has an intended schema and exposure level.
Task 1.3 — Create Tenant Registry Model
Input
Tenant architecture.
Work
Define persistent representation for:
tenant identity;
tenant status;
tenant slug;
tenant settings;
timestamps.
Output
Tenant persistence model.
Done when
A tenant can be uniquely identified and lifecycle-managed.
Task 1.4 — Create Tenant Membership Model
Input
tenant model;
Supabase authentication identity.
Work
Define associations between:
authenticated user;
tenant;
status;
roles;
permissions.
Output
Tenant membership persistence model.
Done when
One user can safely belong to one or more tenants.
Task 1.5 — Define Generic Entity Record Envelope
Input
Metadata-driven storage requirements.
Work
Define stable columns such as:
record ID;
tenant ID;
module key;
entity key;
contract version;
workflow state;
record version;
JSONB payload;
creation identity/time;
update identity/time;
archive state.
Output
Canonical entity record model.
Done when
Arbitrary business records can be represented without adding physical business tables.
Task 1.6 — Define Generic Relationship Store
Input
Entity record model.
Work
Define relationship representation for:
source record;
source entity;
target record;
target entity;
relationship type/key;
tenant scope;
optional metadata.
Output
Generic relationship model.
Done when
Logical foreign-key relationships can exist without generated physical tables.
Task 1.7 — Define JSONB Storage Rules
Input
Entity model.
Work
Define what belongs:
Outside JSONB
tenant ID;
module;
entity;
workflow state;
versioning;
timestamps.
Inside JSONB
tenant-defined business fields.
Output
JSONB storage standard.
Done when
Developers cannot arbitrarily choose where system-level fields live.
Task 1.8 — Establish Baseline Index Strategy
Input
Expected access patterns.
Work
Define initial indexes for:
tenant;
module;
entity;
state;
creation time;
JSONB containment.
Output
Phase 1 indexing strategy.
Done when
Basic record filtering does not require full-table scans under expected POC loads.
Task 1.9 — Define Record Versioning Strategy
Input
Concurrent ERP editing requirements.
Work
Define optimistic concurrency behavior.
Output
Record-version specification.
Done when
Concurrent updates cannot silently overwrite each other.
Task 1.10 — Define Soft-Delete / Archive Semantics
Input
Auditability requirements.
Work
Specify:
normal archive behavior;
restore policy;
visibility rules;
physical deletion rules.
Output
Data lifecycle specification.
Done when
Normal users cannot accidentally destroy auditable business history.
Phase 1 Exit Gate
Proceed only when:
database initializes from zero;
tenants exist;
memberships exist;
generic records exist;
relationships exist;
JSONB rules are frozen;
record concurrency is defined.
Phase 2 — Authentication, Authorization, and Tenant Isolation
Purpose
Prove tenant isolation before exposing dynamic CRUD.
Task 2.1 — Define Authentication Boundary
Input
Supabase Auth.
Work
Define how user identity reaches:
Next.js;
Supabase client;
PostgreSQL;
RLS;
audit events.
Output
Identity propagation design.
Done when
The authenticated user remains identifiable all the way to PostgreSQL.
Task 2.2 — Define Tenant Context Resolution
Input
Authenticated user and tenant membership.
Work
Determine how active tenant context is selected and verified.
Output
Tenant-context specification.
Done when
A request cannot simply claim an arbitrary tenant ID without membership verification.
Task 2.3 — Define Permission Naming Convention
Input
Module/entity architecture.
Work
Define canonical permission patterns such as:
module.entity.read;
module.entity.create;
module.entity.update;
module.entity.delete;
module.action.execute.
Output
Permission namespace standard.
Done when
Permissions can be deterministically derived from metadata.
Task 2.4 — Implement Tenant Membership Security Functions
Input
Tenant/membership schema.
Work
Create internal authorization functions for:
tenant membership;
permissions;
roles if retained.
Output
Central database authorization layer.
Done when
RLS policies do not duplicate complex membership logic.
Task 2.5 — Apply RLS to Tenant-Scoped Tables
Input
All Phase 1 tables.
Work
Apply RLS to:
tenant data;
module contracts;
relationships;
audit data where appropriate.
Output
RLS-secured database.
Done when
Rows are inaccessible without authorized tenant context.
Task 2.6 — Define Table Grants Separately from RLS
Input
RLS architecture.
Work
Determine permitted database operations for runtime roles.
Output
Grant matrix.
Done when
Runtime roles have only the minimum object-level privileges required.
Task 2.7 — Protect Against Service-Role Runtime Usage
Input
Supabase runtime design.
Work
Establish policy forbidding RLS-bypassing credentials from ordinary application execution paths.
Output
Credential handling standard.
Done when
Tenant requests cannot execute using privileged backend credentials.
Task 2.8 — Build Cross-Tenant Security Test Matrix
Input
RLS policies.
Work
Test:
read;
create;
update;
archive;
relationships;
contract access;
aggregate access.
Output
Automated tenant-isolation test suite.
Done when
Tenant A cannot read or mutate Tenant B data under any tested runtime operation.
Task 2.9 — Test Multi-Membership Scenarios
Input
Users belonging to multiple tenants.
Work
Validate tenant switching without data leakage.
Output
Multi-membership security tests.
Done when
Changing active tenant context never causes mixed results.
Phase 2 Exit Gate
No metadata execution work begins until the cross-tenant isolation suite passes completely.
Phase 3 — Metadata Contract Specification
Purpose
Define the XORVA language before building an interpreter for it.
Task 3.1 — Define Contract Root Structure
Input
Fleet metadata example.
Work
Define sections including:
contract header;
runtime policy;
security model;
schema definition;
workflows;
UI layout;
actions;
visualization nodes.
Output
XORVA Module Contract Specification v1.
Done when
Every contract has a deterministic top-level structure.
Task 3.2 — Define Supported Field Types
Input
ERP data requirements.
Work
Define canonical field types.
Examples:
string;
number;
integer;
boolean;
UUID;
date;
datetime;
enum;
object;
array;
relationship.
Output
Field-type specification.
Done when
Every supported field type has validation and rendering semantics.
Task 3.3 — Define Field Constraints
Input
Field types.
Work
Specify:
required;
nullable;
min/max;
length;
enum;
pattern;
uniqueness;
defaults.
Output
Field validation specification.
Done when
Business field validation can be represented declaratively.
Task 3.4 — Define Relationship Metadata
Input
Generic relationship storage.
Work
Specify:
one-to-one;
one-to-many;
many-to-many;
target entity;
delete behavior;
required relationship rules.
Output
Relationship contract specification.
Done when
Relationships can be defined independently of physical schema migrations.
Task 3.5 — Define Workflow Metadata
Input
ERP lifecycle requirements.
Work
Define:
initial state;
allowed states;
state transitions;
transition permissions;
preconditions.
Output
Workflow contract format.
Done when
Record lifecycle behavior can be described without backend controller code.
Task 3.6 — Define UI Metadata
Input
Web/mobile rendering requirements.
Work
Specify:
pages;
blocks;
grids;
component IDs;
icons;
data sources;
responsive behavior;
forms;
tables;
dashboards;
Kanban layouts.
Output
UI contract specification.
Done when
A complete basic application page can be represented as metadata.
Task 3.7 — Define Action Hook Metadata
Input
CRUD and workflow requirements.
Work
Specify:
action ID;
label;
icon;
permission;
confirmation;
capability binding;
inputs;
response behavior;
cache invalidation.
Output
Action contract specification.
Done when
UI actions can reference runtime capabilities without arbitrary executable code.
Task 3.8 — Define Visualization Metadata
Input
Presentation/diagram requirements.
Work
Define nodes and edges for architecture visualizations.
Output
Visualization-node specification.
Done when
A contract can be transformed into a module diagram without inference.
Task 3.9 — Define Metadata Extension Policy
Input
Long-term extensibility goals.
Work
Determine:
reserved namespaces;
vendor extensions;
tenant extensions;
compatibility behavior.
Output
Metadata extension standard.
Done when
Future metadata evolution does not require breaking existing contracts.
Task 3.10 — Publish Contract JSON Schema v1
Input
Tasks 3.1–3.9.
Work
Convert specification into machine-validatable schema.
Output
Canonical XORVA Contract Schema v1.
Done when
A contract can objectively pass or fail structural validation.
Phase 3 Exit Gate
Fleet and Audit contracts must both validate against the same contract specification.
Phase 4 — Contract Registry and Lifecycle
Purpose
Create immutable, versioned business application definitions.
Task 4.1 — Create Module Contract Registry
Input
Contract schema.
Work
Store contracts by:
tenant;
module;
version;
lifecycle status.
Output
Persistent contract registry.
Done when
Multiple modules and versions can coexist.
Task 4.2 — Define Contract Lifecycle States
Input
Release requirements.
Work
Define:
draft;
validated;
staged;
published;
retired.
Output
Contract lifecycle model.
Done when
Contract deployment has explicit states.
Task 4.3 — Enforce Published Contract Immutability
Input
Lifecycle model.
Work
Prevent published contract body mutation.
Output
Immutable contract history.
Done when
Changing a live module requires publishing a new version.
Task 4.4 — Define Canonicalization
Input
JSON contract.
Work
Define deterministic representation for hashing and signing.
Output
Canonical contract serialization specification.
Done when
Equivalent contracts produce identical canonical representation.
Task 4.5 — Define Contract Hashing
Input
Canonical contract.
Work
Generate integrity hash.
Output
Contract integrity mechanism.
Done when
Tampered contract content can be detected.
Task 4.6 — Define Contract Compatibility Rules
Input
Versioning model.
Work
Classify changes as:
backwards compatible;
migration required;
breaking;
prohibited.
Output
Contract compatibility matrix.
Done when
Version upgrades have predictable semantics.
Task 4.7 — Define Record-to-Contract Version Binding
Input
Generic entity storage.
Work
Persist the contract version under which each record was created.
Output
Version-aware record model.
Done when
Historical records remain interpretable after module upgrades.
Task 4.8 — Define Rollback Strategy
Input
Multiple contract versions.
Work
Define how prior compatible versions are reactivated.
Output
Contract rollback procedure.
Done when
A failed release can be reverted without modifying historical versions.
Phase 4 Exit Gate
The system can publish Fleet v1, publish Fleet v2, retain v1 history, and identify which contract version produced each record.
Phase 5 — Deterministic Contract Compiler
Purpose
Create the primary security boundary between generated metadata and runtime execution.
Task 5.1 — Define Compiler Pipeline
Input
Contract specification.
Work
Define stages:
parse;
schema validation;
semantic validation;
security linting;
dependency validation;
canonicalization;
publication artifact generation.
Output
Compiler architecture.
Done when
The publishing process is deterministic and documented.
Task 5.2 — Implement Structural Validation
Input
Contract JSON Schema.
Work
Reject malformed contracts.
Output
Structural validator.
Done when
Invalid contract shapes cannot reach publication.
Task 5.3 — Implement Entity Semantic Validation
Input
Schema definition.
Work
Validate:
duplicate fields;
unsupported types;
invalid defaults;
inconsistent required/nullability rules.
Output
Entity semantic validator.
Done when
Structurally valid but logically invalid schemas are rejected.
Task 5.4 — Validate Relationship Graphs
Input
Relationship metadata.
Work
Check:
referenced entities exist;
target fields exist;
relationship keys are unique;
invalid cycles where prohibited.
Output
Relationship validator.
Done when
Broken references cannot be published.
Task 5.5 — Validate Workflow Graphs
Input
Workflow metadata.
Work
Verify:
initial state exists;
transitions use valid states;
unreachable states;
invalid transition references.
Output
Workflow graph validator.
Done when
Invalid state machines cannot become runtime contracts.
Task 5.6 — Validate Component References
Input
UI component registry.
Work
Reject unknown:
page components;
form controls;
icons where restricted;
data-source types.
Output
UI component validator.
Done when
Metadata cannot request arbitrary React components.
Task 5.7 — Validate Capability References
Input
Capability registry.
Work
Reject unknown action capabilities.
Output
Capability validator.
Done when
Metadata cannot invent executable backend functions.
Task 5.8 — Build Security Linter
Input
Entire contract.
Work
Reject metadata containing forbidden execution constructs.
Examples:
arbitrary SQL;
JavaScript;
shell commands;
filesystem commands;
unknown RPCs;
arbitrary HTTP targets.
Output
Contract security linter.
Done when
Metadata remains declarative.
Task 5.9 — Validate Permissions
Input
Security model and actions.
Work
Verify:
referenced permissions exist;
action permissions are coherent;
required entity permissions exist.
Output
Permission validator.
Done when
Contracts cannot publish internally inconsistent authorization rules.
Task 5.10 — Produce Compiled Contract Artifact
Input
Validated contract.
Work
Generate canonical runtime artifact including:
normalized metadata;
computed defaults;
capability bindings;
integrity hash.
Output
Compiled contract package.
Done when
Runtime consumes compiler output rather than raw AI/user JSON.
Phase 5 Exit Gate
Intentionally malformed or malicious contracts must consistently fail compilation.
Phase 6 — Capability Registry and Certified Extensions Framework
Purpose
Separate generic metadata behavior from trusted implementation logic.
Task 6.1 — Define Capability Identifier Standard
Input
Runtime functions.
Work
Create names such as:
core.entity.create.v1;
core.entity.update.v1;
core.transaction.execute.v1.
Output
Capability naming specification.
Done when
Capabilities have stable, versioned identifiers.
Task 6.2 — Build Capability Registry
Input
Approved operations.
Work
Store mapping between:
capability ID;
implementation endpoint/RPC;
version;
safety classification;
enabled state.
Output
Trusted capability registry.
Done when
Metadata can execute only registered capabilities.
Task 6.3 — Define Capability Safety Classes
Input
Runtime risk model.
Work
Classify capabilities such as:
generic;
transactional;
certified;
privileged.
Output
Capability risk model.
Done when
Higher-risk operations can require stronger controls.
Task 6.4 — Define Certified Extension Interface
Input
Regulatory and complex algorithms.
Work
Specify how future functionality such as VAT or Peppol plugs into the runtime.
Output
Certified extension architecture.
Done when
Complex business logic does not need to be forced into the metadata DSL.
Task 6.5 — Define Capability Version Compatibility
Input
Contract versioning.
Work
Determine how capability upgrades affect existing contracts.
Output
Capability compatibility policy.
Done when
Updating an implementation cannot unexpectedly change historical contract behavior.
Phase 6 Exit Gate
A contract can reference approved capabilities but cannot choose arbitrary backend implementation names.