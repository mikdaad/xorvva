# RightSource Technologies
## Cloud ERP Platform — Technical Proposal Document

---

| | |
|---|---|
| **Document Title** | Technical Proposal — Multi-Tenant Cloud ERP Platform |
| **Version** | 1.0 |
| **Date** | July 4, 2026 |
| **Prepared By** | Development Team — RightSource Technologies |
| **Classification** | Internal — Confidential |
| **Status** | Awaiting Approval |

---

## Table of Contents

1. Executive Summary
2. Project Scope and Objectives
3. Proposed Technology Stack
4. System Architecture
5. Module Scope — MVP vs Phase 2
6. Multi-Tenancy Strategy
7. Dynamic Customization Engine
8. Integration and API Strategy
9. Infrastructure and Deployment
10. Security Considerations
11. Development Timeline
12. Team and Resource Requirements
13. Risk Assessment
14. Budget Estimate
15. Approval and Sign-Off

---

## 1. Executive Summary

RightSource Technologies proposes the development of a **cloud-native, multi-tenant Enterprise Resource Planning (ERP) platform** designed to serve corporate owners managing multiple subsidiaries across diverse industries.

The platform will deliver modular business functionality — including Accounting, Sales and CRM, Purchasing, Human Resources, Payroll, and Inventory Management — through a subscription-based model where each business entity independently selects and configures the modules it requires.

The system will be **API-first**, enabling seamless integration with third-party applications such as Point-of-Sale (POS) systems, e-commerce platforms, and external accounting software.

### Key Deliverables (MVP — 8 Weeks)

- Multi-tenant platform with complete data isolation
- 8 core business modules with 41 functional sub-modules
- Dynamic module activation per business entity
- Custom field engine for runtime form customization
- RESTful API for all modules
- Web-based frontend with responsive design
- Cloud deployment on production infrastructure

### Strategic Differentiators

| Feature | Our Platform | Traditional ERPs |
|---------|-------------|-----------------|
| Deployment | Cloud-native SaaS | On-premise installation |
| Customization | Runtime configuration — no code changes | Requires developer involvement |
| Module Selection | Subscribe to individual modules | All-or-nothing packages |
| API Access | Every feature exposed via REST API | Limited or proprietary APIs |
| Multi-Industry | Same platform, different configurations | Industry-specific products |
| Time to Market | 8-week MVP cycle | 6-12 month implementation |

---

## 2. Project Scope and Objectives

### 2.1 Business Objectives

1. Enable corporate owners to onboard subsidiaries with industry-specific configurations
2. Provide modular ERP functionality with per-entity subscription control
3. Ensure complete data isolation between tenants
4. Deliver API-first architecture for third-party integration capability
5. Support runtime customization without development intervention

### 2.2 Technical Objectives

1. Build a scalable multi-tenant platform on modern cloud infrastructure
2. Implement modular architecture that supports independent module deployment in future phases
3. Achieve sub-second API response times for standard operations
4. Ensure 99.5% uptime target for production environment
5. Establish CI/CD pipeline for continuous delivery

### 2.3 Out of Scope (MVP)

The following items are explicitly excluded from the initial 8-week delivery and will be addressed in subsequent phases:

- Mobile native application (iOS/Android)
- Full Arabic language localization and RTL layout
- Advanced workflow automation engine
- Third-party integration connectors (Zoho, QuickBooks, Xero)
- Multi-currency transaction processing
- Custom report builder
- Subscription billing and payment gateway integration

---

## 3. Proposed Technology Stack

### 3.1 Backend

| Component | Technology | Version | Justification |
|-----------|-----------|---------|---------------|
| **Runtime** | Node.js | 20 LTS | Non-blocking I/O architecture ideal for high-concurrency API servers. Largest package ecosystem (npm). Single language across full stack reduces context-switching. |
| **Framework** | Express.js | 5.x | Industry-standard HTTP framework with mature middleware ecosystem. Lightweight, unopinionated, and well-documented. |
| **Language** | TypeScript | 5.x | Static type system prevents runtime errors, improves code maintainability, and provides superior IDE support. Essential for large-scale projects. |
| **ORM** | Prisma | 6.x | Type-safe database client with auto-generated queries from schema. Handles migrations, seeding, and schema management. Eliminates raw SQL for standard operations. |
| **Validation** | Zod | 3.x | Runtime type validation that integrates with TypeScript's type system. Ensures API input integrity before database operations. |
| **Authentication** | JSON Web Tokens | — | Stateless authentication suitable for distributed and scalable architectures. Access token (15min) + refresh token (7 days) pattern. |
| **Password Security** | bcrypt.js | — | Industry-standard password hashing with configurable salt rounds. |

### 3.2 Database

| Component | Technology | Justification |
|-----------|-----------|---------------|
| **Database Engine** | PostgreSQL 16 | Most advanced open-source relational database. ACID-compliant. Native JSONB support for dynamic fields. Full-text search built-in. Row-level security capability for multi-tenant isolation. |
| **Hosting** | Neon (Cloud PostgreSQL) | Serverless PostgreSQL with auto-scaling, connection pooling, and database branching. Zero infrastructure management. Point-in-time recovery included. |

**Why PostgreSQL over alternatives:**

| Alternative | Why Not Selected |
|------------|-----------------|
| MySQL | Lacks native JSONB querying capabilities. Weaker support for complex transactions. |
| MongoDB | Document-based model unsuitable for relational ERP data (invoices, line items, payments). No ACID guarantees across collections. |
| SQL Server | Licensing costs. Vendor lock-in to Microsoft ecosystem. |
| Firebase | Not suitable for complex relational queries required by accounting and reporting modules. |

### 3.3 Frontend

| Component | Technology | Justification |
|-----------|-----------|---------------|
| **Framework** | React 18 | Component-based architecture. Largest ecosystem and community. Superior performance with virtual DOM. |
| **Build Tool** | Vite | 10x faster development server startup compared to webpack-based alternatives. Native ES module support. |
| **Language** | TypeScript | Shared types with backend. Compile-time error detection. |
| **UI Library** | Ant Design 5.x | Enterprise-grade component library with 60+ pre-built components including data tables, forms, date pickers, and tree structures. Built-in RTL support for future Arabic localization. |
| **State (Server)** | TanStack Query | Automatic caching, background refetching, and loading state management for API data. |
| **State (Client)** | Zustand | Lightweight client-state management for authentication state, UI preferences, and language settings. |
| **Internationalization** | i18next | Industry-standard localization framework. Prepared for Arabic localization in Phase 2. |
| **Charts** | Recharts | React-native charting library for dashboard visualizations. |

**Why Not Next.js:**
Next.js provides server-side rendering (SSR) which benefits SEO for public-facing websites. This ERP is a private, authenticated application — SSR provides no advantage and adds unnecessary complexity.

### 3.4 DevOps and Infrastructure

| Component | Technology | Justification |
|-----------|-----------|---------------|
| **Containerization** | Docker | Application packaged as container for consistent deployment across environments. |
| **Backend Hosting** | Railway.app (MVP) then AWS ECS (Scale) | Railway provides one-click deployment with auto-scaling. Migration to AWS ECS when tenant count exceeds 100. |
| **Frontend Hosting** | Vercel | Zero-configuration React deployment with global CDN, automatic HTTPS, and preview deployments. |
| **File Storage** | Cloudinary (MVP) then AWS S3 (Scale) | Cloudinary provides free-tier cloud storage with image optimization. S3 migration planned when storage exceeds 25GB. |
| **Version Control** | Git + GitHub | Industry-standard source code management with branch-based workflow. |

---

## 4. System Architecture

### 4.1 Architecture Pattern: Modular Monolith

The platform will be built as a **modular monolith** — a single deployable application with strictly separated internal modules, each with its own routes, controllers, services, and validation layers.

```
                    ┌─────────────────────────┐
                    │      Load Balancer       │
                    │      (HTTPS / SSL)       │
                    └────────────┬────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                   │
    ┌─────────▼────────┐  ┌─────▼──────┐  ┌────────▼────────┐
    │  Frontend (React) │  │  API Server │  │  File Storage   │
    │  Vercel CDN       │  │  Node.js    │  │  Cloudinary     │
    │                   │  │  Railway    │  │                 │
    └───────────────────┘  │             │  └─────────────────┘
                           │  Modules:   │
                           │  ┌────────┐ │
                           │  │ Auth   │ │
                           │  │ Tenant │ │
                           │  │ Sales  │ │
                           │  │ Acctng │ │
                           │  │ HR     │ │
                           │  │ Invent │ │
                           │  │  ...   │ │
                           │  └────────┘ │
                           └──────┬──────┘
                                  │
                           ┌──────▼──────┐
                           │  PostgreSQL  │
                           │  Neon Cloud  │
                           └─────────────┘
```

### 4.2 Modular Monolith vs Microservices — Decision Rationale

| Factor | Modular Monolith (Selected) | Microservices |
|--------|----------------------------|--------------|
| **Team size required** | 1-3 developers | 5-15 developers minimum |
| **Infrastructure complexity** | 1 server, 1 database | 7+ servers, 7+ databases |
| **Development speed** | Faster — direct function calls | Slower — HTTP calls between services |
| **Debugging** | Single log stream | Distributed tracing required |
| **Data consistency** | Database transactions (ACID) | Eventual consistency, saga patterns |
| **Deployment** | One deployment | Multiple coordinated deployments |
| **Monthly cost** | Approximately $5-20 | Approximately $100-500 minimum |

### 4.3 Microservice Migration Path

The modular monolith architecture is explicitly designed for future extraction into microservices. Each module has zero direct dependencies on other modules' internal implementations. When scaling demands require it (projected at 500+ concurrent tenants), individual high-traffic modules can be extracted into independent services without architectural redesign.

**Estimated migration timeline:** 2-4 weeks per module extraction, executable in Phase 3 or beyond.

---

## 5. Module Scope

### 5.1 MVP Delivery (8 Weeks) — 41 Sub-Modules

| Module | Sub-Modules Included | Count |
|--------|---------------------|-------|
| **Platform and Settings** | Company Setup, Users, Roles and Permissions, Module Registry, Custom Fields, Tax Configuration, Currency Settings | 7 |
| **Accounting** | Chart of Accounts, Journal Entries, General Ledger, Trial Balance, Profit and Loss, Balance Sheet | 6 |
| **Sales and CRM** | Customers, Services/Products, Invoices, Payments Received, Credit Notes | 5 |
| **Purchasing** | Suppliers, Purchase Orders, Purchase Invoices, Supplier Payments | 4 |
| **HR** | Employees, Departments, Designations, Attendance, Leave Management | 5 |
| **Payroll** | Payroll Processing, Payslips, Salary Structure | 3 |
| **Inventory** | Products, Warehouses, Stock Levels, Stock Movement | 4 |
| **Reports and Dashboard** | Dashboard, Sales Report, Payment Report, Outstanding Report, Expense Report, VAT Report, Payroll Report | 7 |
| **Total** | | **41** |

### 5.2 Phase 2 Delivery (Month 3-4) — 20 Sub-Modules

| Addition | Sub-Modules |
|----------|-------------|
| Accounting Extended | Bank Reconciliation, Budget Management, Multi-Currency, Financial Year Close |
| Sales Extended | Quotations, Sales Pipeline/Leads, Recurring Invoices |
| Purchasing Extended | Debit Notes |
| HR Extended | Employee Documents, Training and Certifications, Employee Self-Service |
| Payroll Extended | Loan Management, End of Service Gratuity |
| Inventory Extended | Stock Adjustment, Barcode/SKU Scanner |
| Projects (New Module) | Projects, Tasks, Milestones, Timesheets |
| Reports Extended | Custom Report Builder |

### 5.3 Phase 3 (Month 5-6)

- Arabic language localization with RTL layout
- POS module and third-party integration connectors
- Mobile responsive optimization
- External API connectors (Zoho, QuickBooks, Xero)
- Subscription billing with payment gateway integration
- Advanced workflow automation engine

---

## 6. Multi-Tenancy Strategy

### 6.1 Approach: Shared Database with Row-Level Isolation

All tenants share a single PostgreSQL database. Every table includes a `tenant_id` column. A global middleware layer automatically injects tenant filtering into all database queries.

### 6.2 Data Isolation Guarantee

- Tenant identification is extracted from the authenticated JWT token
- Middleware injects tenant_id filtering into every query before execution
- No direct SQL queries — all access through Prisma ORM with mandatory tenant scoping
- Tenant ID cannot be overridden by API request parameters

### 6.3 Tenant Hierarchy

```
Platform (Super Admin)
└── Tenant (Corporate Owner)
    ├── Company A (Subsidiary 1)
    │   ├── Branch 1
    │   └── Branch 2
    └── Company B (Subsidiary 2)
        └── Branch 1
```

---

## 7. Dynamic Customization Engine

### 7.1 Module Activation

Companies select active modules during onboarding. Module subscriptions are stored in a registry table and enforced at both API and UI layers. Modules can be activated or deactivated at any time without system restart or code deployment.

### 7.2 Custom Fields

Companies can add custom fields to any entity form (Employees, Customers, Products, Invoices, etc.) through a settings interface. Custom field definitions are stored in a metadata table. Custom field values are stored in a PostgreSQL JSONB column on each entity record, enabling schema-free extension without database migration.

**Supported field types:** Text, Number, Date, Dropdown (single-select), Multi-select, File Upload, Boolean (checkbox), Email, Phone, URL, Textarea.

### 7.3 Onboarding Workflow

New tenant registration follows a guided setup wizard:

1. **Company Profile** — Name, industry, country, currency
2. **Module Selection** — Choose required modules from available catalog
3. **Admin Account** — Create primary administrative user
4. **Auto-Configuration** — System generates default chart of accounts, tax rates, roles, and permissions based on industry and country selection

---

## 8. Integration and API Strategy

### 8.1 REST API

Every module exposes a complete RESTful API following standard conventions:

| Method | Endpoint Pattern | Purpose |
|--------|-----------------|---------|
| GET | /api/v1/{module} | List records (paginated, searchable, filterable) |
| GET | /api/v1/{module}/:id | Retrieve single record |
| POST | /api/v1/{module} | Create new record |
| PUT | /api/v1/{module}/:id | Update existing record |
| DELETE | /api/v1/{module}/:id | Soft-delete record |

### 8.2 Authentication

API access is secured via JWT bearer tokens. Each tenant can generate API keys for third-party access with configurable permission scopes.

### 8.3 POS and Third-Party Integration

The API-first architecture enables integration with external systems:

| Integration Type | How It Works | Timeline |
|-----------------|-------------|----------|
| **POS Systems** | POS sends sales data to our Sales API. Our system records invoices and payments automatically. | Phase 2 |
| **E-Commerce** | Online store sends orders via API. System creates invoices and updates inventory. | Phase 2 |
| **Accounting Software** | Export journal entries, chart of accounts via API endpoints. | Phase 2 |
| **Payment Gateways** | Receive payment confirmations via webhooks. Auto-reconcile with invoices. | Phase 2 |

**MVP delivers the complete API foundation.** Specific third-party connectors are implemented in Phase 2 using the same API infrastructure.

### 8.4 Webhooks (Phase 2)

Event-driven notifications to external systems:
- Invoice created or paid — notify connected POS
- Payment received — notify external accounting system
- Stock level changed — notify e-commerce platform

---

## 9. Infrastructure and Deployment

### 9.1 Environment Strategy

| Environment | Purpose | Infrastructure |
|-------------|---------|---------------|
| **Development** | Active development and testing | Local machine + Neon DB branch |
| **Staging** | Pre-production validation | Railway preview + Neon DB branch |
| **Production** | Live system | Railway + Neon Production DB |

### 9.2 Deployment Pipeline

```
Developer pushes code to GitHub
    → Automated tests run
    → Docker image built
    → Deployed to Railway (automatic)
    → Health check verified
    → Traffic routed to new version
```

### 9.3 Scaling Path

| Tenant Count | Infrastructure Change |
|-------------|----------------------|
| 1-50 tenants | Railway + Neon Free/Pro (current setup) |
| 50-500 tenants | AWS ECS + RDS PostgreSQL + S3 |
| 500+ tenants | AWS ECS Auto-Scaling + RDS Multi-AZ + ElastiCache Redis |

---

## 10. Security Considerations

| Measure | Implementation |
|---------|---------------|
| **Authentication** | JWT with short-lived access tokens (15 min) and long-lived refresh tokens (7 days) |
| **Password Storage** | bcrypt hashing with 10 salt rounds |
| **Data Isolation** | Mandatory tenant_id filtering on all queries via global middleware |
| **Input Validation** | Zod schema validation on all API inputs before processing |
| **SQL Injection** | Prevented by Prisma ORM — parameterized queries only |
| **XSS Protection** | React built-in JSX escaping + Helmet.js HTTP security headers |
| **CORS** | Restricted to frontend domain only |
| **Rate Limiting** | express-rate-limit on authentication and public endpoints |
| **HTTPS** | Enforced via hosting platform (Railway/Vercel provide automatic SSL) |
| **Environment Secrets** | Stored in environment variables, never committed to source code |

---

## 11. Development Timeline

### 8-Week Delivery Schedule

| Week | Focus Area | Deliverables |
|------|-----------|-------------|
| **Week 1** | Platform Foundation | Multi-tenant database schema, authentication system (signup/login/JWT), tenant isolation middleware, module registry, user and role management |
| **Week 2** | Financial Modules Part 1 | Customer management, service/product catalog, invoice builder with auto-calculations and VAT, payment processing with invoice status updates, credit notes |
| **Week 3** | Financial Modules Part 2 + HR | Purchasing module (suppliers, POs, purchase invoices, supplier payments), complete accounting engine (COA, journal entries, ledger, trial balance, P&L, balance sheet), employee management with departments and designations |
| **Week 4** | Operational Modules | Attendance and leave management, payroll processing with payslips, inventory management (products, warehouses, stock), all reporting endpoints, dashboard aggregation API |
| **Week 5** | Frontend Foundation | React application setup with Ant Design theming, layout system (sidebar, header, content), authentication pages (login, signup), onboarding wizard, dashboard page with charts, reusable DataTable component |
| **Week 6** | Frontend Core Pages | Customer/supplier CRUD pages, invoice builder UI with line items and auto-calculation, payment recording pages, purchasing pages, HR employee management pages |
| **Week 7** | Frontend Remaining Pages | Accounting pages (COA tree, journal entries, ledger, trial balance, P&L), payroll and attendance pages, inventory pages, all report pages, settings and user management pages |
| **Week 8** | Deployment and QA | Docker containerization, cloud deployment to Railway and Vercel, end-to-end testing, bug fixes, performance optimization, production launch |

---

## 12. Team and Resource Requirements

### 12.1 Development Team

| Role | Count | Responsibility |
|------|-------|---------------|
| Full-Stack Developer | 1 | Backend development, frontend development, database design, deployment, testing |
| AI Code Assistant | 1 | Accelerated code generation, pattern replication, debugging assistance |

### 12.2 Development Methodology

AI-assisted development methodology where automated code generation handles 70-80% of repetitive implementation (CRUD operations, API endpoints, frontend page scaffolding) while the developer focuses on architecture decisions, business logic validation, integration testing, and quality assurance.

### 12.3 Tools and Accounts Required

| Tool | Purpose | Cost |
|------|---------|------|
| GitHub Repository | Source code management | Free |
| Neon Account | PostgreSQL database hosting | Free tier |
| Cloudinary Account | File and image storage | Free tier |
| Railway Account | Backend server hosting | Approximately $5/month |
| Vercel Account | Frontend static hosting | Free tier |
| Postman | API testing during development | Free |
| Domain Name | Production URL (e.g., erp.rightsource.com) | Approximately $10/year |

---

## 13. Risk Assessment

| # | Risk | Probability | Impact | Mitigation Strategy |
|---|------|------------|--------|-------------------|
| 1 | Multi-tenant data leak between tenants | Low | Critical | Mandatory tenant middleware on every route. Automated integration tests verifying isolation. Code review on every service file. |
| 2 | Accounting calculation errors | Medium | High | Unit tests for all financial calculations. Test with real-world invoice and payment scenarios. Reconciliation checks in trial balance. |
| 3 | Scope creep during development | High | Medium | Strict MVP scope as defined in this document. All additions deferred to Phase 2 backlog. Change requests require formal timeline impact assessment. |
| 4 | Single developer dependency | Medium | High | Comprehensive code documentation. Modular architecture enables rapid onboarding of additional developers. AI-assisted development reduces individual dependency. |
| 5 | Third-party service outage | Low | Medium | Database branching for backups. Application designed for platform-agnostic deployment. Migration guides to alternative providers maintained. |
| 6 | Performance degradation at scale | Low (MVP) | Medium | Database indexing strategy defined upfront. Query optimization patterns established. Horizontal scaling path documented. |

---

## 14. Budget Estimate

### 14.1 Infrastructure Costs (Monthly)

| Service | MVP Phase (Month 1-2) | Production Phase (Month 3+) |
|---------|----------------------|---------------------------|
| Database (Neon PostgreSQL) | Free tier | $19/month (Pro plan) |
| Backend Hosting (Railway) | $5/month | $20/month |
| Frontend Hosting (Vercel) | Free tier | Free tier |
| File Storage (Cloudinary) | Free tier | $29/month (Plus plan) |
| Domain Name | — | $10/year |
| **Monthly Total** | **Approximately $5** | **Approximately $70** |

### 14.2 Development Investment

| Phase | Duration | Key Deliverables |
|-------|----------|-----------------|
| **MVP** | 8 weeks | Complete platform with 8 modules, 41 sub-modules, full frontend, and production deployment |
| **Phase 2** | 4-6 weeks | 20 additional sub-modules, Arabic localization, POS integration readiness |
| **Phase 3** | 4-6 weeks | Mobile optimization, third-party connectors, advanced workflow engine, subscription billing |

---

## 15. Approval and Sign-Off

### 15.1 Decisions Required Before Development Commences

| # | Decision Required | Recommended Option |
|---|-------------------|--------------------|
| 1 | Approve the proposed technology stack as defined in Section 3? | Approve as proposed |
| 2 | Confirm MVP scope of 41 sub-modules across 8 modules for 8-week delivery? | Approve as proposed |
| 3 | Approve modular monolith architecture with documented microservice migration path for Phase 3+? | Approve — modular monolith for MVP, microservice extraction when scaling demands require it |
| 4 | Confirm all Phase 2 and Phase 3 items are deferred from MVP scope? | Approve deferral |
| 5 | Approve infrastructure budget (approximately $5/month for MVP, $70/month for production)? | Approve as proposed |
| 6 | Approve the 8-week development timeline as defined in Section 11? | Approve as proposed |
| 7 | Confirm the first industry vertical for the platform? | Tadbeer (domestic worker management) — existing requirements analysis available |

### 15.2 Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Project Lead | _________________ | _________________ | ___/___/2026 |
| Technical Lead | _________________ | _________________ | ___/___/2026 |
| Prepared By | _________________ | _________________ | ___/___/2026 |

---

| | |
|---|---|
| **Document Version** | 1.0 |
| **Next Review Date** | Upon MVP completion (Week 8) |
| **Distribution** | Project Lead, Technical Lead, Development Team |
| **Confidentiality** | Internal use only — not for external distribution |
