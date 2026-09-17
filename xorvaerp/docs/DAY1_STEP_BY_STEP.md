# Xorva ERP — Day 1: Auth Module (Step-by-Step Execution)

**Date:** Tuesday, July 14, 2026  
**Goal:** .NET solution running + Auth backend working + Database connected + Login/Register UI + Tests  
**Working Hours:** ~10 hours of focused execution  
**Tools:** Antigravity IDE (code generation) + VS Code Terminal (dotnet CLI)

---

## How To Read This Document

Each step follows this format:

- **WHAT** — What we're building
- **WHO** — Antigravity generates code, or you run commands in VS Code
- **FILES** — Exact files created or modified
- **CHECKPOINT** — How to verify the step is done before moving on
- **TIME** — Estimated duration

> [!IMPORTANT]
> **Do NOT skip checkpoints.** Each step builds on the previous one. If a checkpoint fails, we fix it before moving forward. This is how 20-year architects work — verify at every layer, catch issues early, not at the end.

---

## Phase A — Foundation (Steps 1–3)

> The skeleton. No business logic yet. Just folders, projects, packages.

---

### Step 1: Create Workspace Folder Structure

**WHAT:** Create the 4 top-level directories and organize existing files.

**WHO:** Antigravity creates folders. You verify in Explorer.

**Structure Created:**
```
xorvaErp/
├── backend/              ← NEW (empty for now, .NET solution will live here)
├── frontend/             ← NEW (empty for now, React app will live here)
├── context/              ← NEW (AI agent context tracking files)
└── docs/                 ← NEW (existing .md files moved here)
    ├── erp_tech_stack_brief.md          ← moved from root
    ├── xorva_phase_1_plan.md            ← moved from root
    ├── speed_strategy.md                ← moved from root
    ├── backend_discussion.md            ← moved from root
    ├── backend_step_by_step.md          ← moved from root
    ├── frontend_discussion.md           ← moved from root
    ├── technical_proposal.md            ← moved from root
    ├── tadbeer_system_analysis.md       ← moved from root
    ├── erp_tech_stack_brief_dotnet.md   ← moved from root
    ├── Xorva_Brand_Guidelines_.pdf      ← moved from root
    └── Xorva_Brand_Guidelines_.docx     ← moved from root
```

**Also:** Delete `XorvaERP.slnx` from root (empty shell, we'll create a proper one in `backend/`).

**CHECKPOINT:**
- ✅ `backend/` folder exists and is empty
- ✅ `frontend/` folder exists and is empty
- ✅ `context/` folder exists and is empty
- ✅ `docs/` folder exists with all moved files
- ✅ Root only has `backend/`, `frontend/`, `context/`, `docs/` — clean

**TIME:** 5 minutes

---

### Step 2: Create .NET Solution + Projects

**WHAT:** Create the Modular Monolith solution with all 8 projects and wire up dependencies.

**WHO:** You run these commands in **VS Code Terminal**, from `c:\Users\HP\Desktop\xorvaErp\backend\`

**Projects Created:**

| Project | Type | Purpose |
|---------|------|---------|
| `Xorva.Core` | classlib | Shared kernel — base entities, enums, interfaces, exceptions |
| `Xorva.Infrastructure` | classlib | EF Core DbContext, JWT service, password hasher |
| `Xorva.API` | webapi | ASP.NET Core host — controllers, middleware, Program.cs |
| `Xorva.Modules.Auth` | classlib | Auth module — login, register, refresh, RBAC |
| `Xorva.Modules.Tenants` | classlib | Tenant module — companies, branches, settings |
| `Xorva.Modules.HR` | classlib | HR module — departments, employees |
| `Xorva.Tests.Unit` | xunit | Unit tests |
| `Xorva.Tests.Integration` | xunit | API integration tests |

**Dependency Wiring:**

```mermaid
graph TD
    API["Xorva.API"] --> Infra["Xorva.Infrastructure"]
    API --> Auth["Modules.Auth"]
    API --> Tenants["Modules.Tenants"]
    API --> HR["Modules.HR"]
    Infra --> Core["Xorva.Core"]
    Auth --> Core
    Tenants --> Core
    HR --> Core
    TestU["Tests.Unit"] --> Core
    TestU --> Auth
    TestI["Tests.Integration"] --> API
```

**The Exact Commands (Run in Order):**

I will provide the exact `dotnet` CLI commands when we execute this step. They are the corrected versions from the Master Plan (no `src/` prefix).

**CHECKPOINT:**
- ✅ `dotnet build` from `backend/` compiles with 0 errors, 0 warnings
- ✅ Solution has 8 projects listed: `dotnet sln list`
- ✅ Folder structure:
  ```
  backend/
  ├── XorvaERP.sln (or .slnx)
  ├── Xorva.Core/
  ├── Xorva.Infrastructure/
  ├── Xorva.API/
  ├── Modules/
  │   ├── Xorva.Modules.Auth/
  │   ├── Xorva.Modules.Tenants/
  │   └── Xorva.Modules.HR/
  └── Tests/
      ├── Xorva.Tests.Unit/
      └── Xorva.Tests.Integration/
  ```

**TIME:** 15 minutes

---

### Step 3: Install NuGet Packages

**WHAT:** Install all required NuGet packages for each project.

**WHO:** You run `dotnet add package` commands in **VS Code Terminal**.

**Packages Per Project:**

| Project | Packages | Why |
|---------|----------|-----|
| **Xorva.Core** | `MediatR.Contracts` | IRequest, INotification interfaces (no handler implementations — those are in modules) |
| **Xorva.Infrastructure** | `Npgsql.EntityFrameworkCore.PostgreSQL`, `Microsoft.EntityFrameworkCore`, `Microsoft.EntityFrameworkCore.Design`, `Microsoft.AspNetCore.Authentication.JwtBearer`, `BCrypt.Net-Next`, `Microsoft.EntityFrameworkCore.Tools` | PostgreSQL + EF Core + JWT validation + password hashing |
| **Xorva.API** | `MediatR`, `FluentValidation.DependencyInjectionExtensions`, `Swashbuckle.AspNetCore` | Full MediatR (DI + pipeline behaviors) + validation DI + Swagger |
| **Xorva.Modules.Auth** | `MediatR`, `FluentValidation` | MediatR handlers + FluentValidation rules for auth commands |
| **Xorva.Modules.Tenants** | `MediatR`, `FluentValidation` | Same pattern for tenant commands |
| **Xorva.Modules.HR** | `MediatR`, `FluentValidation` | Same pattern for HR commands |
| **Xorva.Tests.Unit** | `Moq`, `FluentAssertions` | Mocking + readable assertions |
| **Xorva.Tests.Integration** | `Microsoft.AspNetCore.Mvc.Testing`, `FluentAssertions` | In-memory API testing |

**CHECKPOINT:**
- ✅ `dotnet build` still compiles with 0 errors after all packages installed
- ✅ Each `.csproj` file shows the correct `<PackageReference>` entries
- ✅ NuGet restore successful (no "package not found" errors)

**TIME:** 10 minutes

---

## Phase B — Backend Auth (Steps 4–10)

> The heart of Day 1. This is where the actual architecture materializes.

---

### Step 4: Build Xorva.Core (Shared Kernel)

**WHAT:** The foundation that ALL modules depend on. Base classes, contracts, common types.

**WHO:** Antigravity generates all files. You review.

**Files Created:**

```
Xorva.Core/
├── Entities/
│   ├── BaseEntity.cs              ← Guid Id, DateTime CreatedAt, DateTime? UpdatedAt
│   ├── AuditableEntity.cs         ← Extends BaseEntity + Guid? CreatedBy, Guid? UpdatedBy
│   └── TenantEntity.cs            ← Extends AuditableEntity + Guid TenantId, Guid CompanyId
├── Enums/
│   ├── SystemRole.cs              ← SystemAdmin=0, SuperAdmin=1, CompanyAdmin=2, Manager=3, Employee=4
│   └── ApprovalStatus.cs          ← Pending=0, Approved=1, Rejected=2 (for Day 3, but define now)
├── Interfaces/
│   ├── ICurrentTenantService.cs   ← Guid TenantId, Guid CompanyId, Guid UserId, SystemRole Role
│   └── IDateTimeProvider.cs       ← DateTime UtcNow (testable time abstraction)
├── Exceptions/
│   ├── NotFoundException.cs       ← "Entity {name} with id {id} not found"
│   ├── ForbiddenException.cs      ← "You don't have permission to perform this action"
│   ├── ConflictException.cs       ← "Entity already exists" (duplicate email, etc.)
│   └── BadRequestException.cs     ← General validation failures
└── Common/
    ├── ApiResponse.cs             ← { bool Success, T? Data, string? Message, List<string>? Errors }
    └── PagedResult.cs             ← { List<T> Items, int TotalCount, int Page, int PageSize, int TotalPages }
```

**Why This Matters:**

Every module inherits from these base classes. `TenantEntity` means every entity automatically has `TenantId` and `CompanyId` — the multi-tenancy filter fields. `ApiResponse<T>` ensures every endpoint returns the same shape — frontend developers love this consistency.

**Design Decisions Made Here:**

| Decision | Rationale |
|----------|-----------|
| `Guid` for all IDs, not `int` | Multi-tenant safety — sequential integers leak business information (how many records exist). GUIDs are universally unique across tenants. |
| `IDateTimeProvider` instead of `DateTime.UtcNow` | Testability — unit tests can inject a fake clock. Production injects the real UTC clock. |
| Exceptions inherit from a common base | The `ExceptionMiddleware` (Step 7) catches these and maps them to HTTP status codes: NotFoundException→404, ForbiddenException→403, etc. |
| `ApiResponse<T>` wraps everything | Frontend always parses `{ success, data, message, errors }`. No guessing the response shape. |

**CHECKPOINT:**
- ✅ `dotnet build Xorva.Core` compiles with 0 errors
- ✅ All 11 files created and no dependencies on any other project (Core depends on NOTHING except MediatR.Contracts)

**TIME:** 30 minutes

---

### Step 5: Build Xorva.Infrastructure (Data Layer)

**WHAT:** The database connection, EF Core DbContext, and shared services (JWT, password hashing, tenant resolution).

**WHO:** Antigravity generates all files. You review.

**Files Created:**

```
Xorva.Infrastructure/
├── Data/
│   ├── XorvaDbContext.cs                          ← The DbContext with global query filters
│   └── Configurations/
│       ├── ApplicationUserConfiguration.cs        ← Fluent API for Users table
│       └── RefreshTokenConfiguration.cs           ← Fluent API for RefreshTokens table
├── Services/
│   ├── JwtTokenService.cs                         ← Generate access token + refresh token
│   ├── PasswordHasher.cs                          ← BCrypt hash + verify
│   ├── CurrentTenantService.cs                    ← Read TenantId/CompanyId from HttpContext claims
│   └── DateTimeProvider.cs                        ← Real UTC clock implementation
└── Extensions/
    └── InfrastructureExtensions.cs                ← DI: AddDbContext, AddScoped<ICurrentTenantService>, etc.
```

**Critical Design: The DbContext**

The `XorvaDbContext` does two critical things:

1. **Registers all entity DbSets** — `DbSet<ApplicationUser>`, `DbSet<RefreshToken>`, etc.
2. **Applies Global Query Filters** — Every query on `TenantEntity` subclasses automatically adds `WHERE TenantId = @currentTenantId`. This is the EF Core layer of multi-tenancy enforcement.

```
Query: db.Employees.ToList()
EF Core silently converts to: SELECT * FROM Employees WHERE TenantId = '...' AND CompanyId = '...'
```

No developer can accidentally query across tenants. It's physically impossible at the ORM level.

**Critical Design: JWT Token Service**

The JWT token contains these claims:

| Claim | Value | Used For |
|-------|-------|----------|
| `sub` | User's Guid ID | Identity |
| `email` | User's email | Display |
| `role` | SystemRole value | Authorization (RBAC) |
| `tenantId` | Tenant Guid | Multi-tenancy filter |
| `companyId` | Company Guid | Company-level filter |
| `exp` | Expiry timestamp | Token validity (15 min access, 7 day refresh) |

The `CurrentTenantService` reads these claims from `HttpContext.User` on every request. The DbContext global filter uses the `TenantId` from this service.

**CHECKPOINT:**
- ✅ `dotnet build Xorva.Infrastructure` compiles
- ✅ Infrastructure references ONLY Xorva.Core (verify `.csproj`)
- ✅ DbContext has global query filters configured
- ✅ JWT service can generate tokens with all required claims

**TIME:** 45 minutes

---

### Step 6: Build Auth Module

**WHAT:** The complete authentication and authorization module. This is the largest step of Day 1.

**WHO:** Antigravity generates all files. You review the business logic carefully.

**Files Created:**

```
Modules/Xorva.Modules.Auth/
├── Entities/
│   ├── ApplicationUser.cs                 ← Id, Email, PasswordHash, FirstName, LastName, Role, TenantId, CompanyId, IsActive, RefreshTokens
│   └── RefreshToken.cs                    ← Id, Token, ExpiresAt, IsRevoked, UserId
├── Commands/
│   ├── RegisterUser/
│   │   ├── RegisterUserCommand.cs         ← { Email, Password, FirstName, LastName, Role, CompanyId }
│   │   ├── RegisterUserCommandHandler.cs  ← Check email unique → hash password → create user → return
│   │   └── RegisterUserValidator.cs       ← Email required+valid, Password min 8 chars, Name required
│   ├── LoginUser/
│   │   ├── LoginUserCommand.cs            ← { Email, Password }
│   │   ├── LoginUserCommandHandler.cs     ← Find user → verify password → generate JWT + refresh token → return
│   │   └── LoginUserValidator.cs          ← Email required, Password required
│   └── RefreshToken/
│       ├── RefreshTokenCommand.cs         ← { RefreshToken }
│       └── RefreshTokenCommandHandler.cs  ← Validate refresh token → generate new JWT + new refresh token → revoke old
├── Queries/
│   ├── GetCurrentUser/
│   │   ├── GetCurrentUserQuery.cs         ← Empty (uses ClaimsPrincipal from context)
│   │   └── GetCurrentUserQueryHandler.cs  ← Read user by ID from JWT claims → return UserDto
│   └── GetUsersByRole/
│       ├── GetUsersByRoleQuery.cs         ← { Role?, Page, PageSize }
│       └── GetUsersByRoleQueryHandler.cs  ← List users filtered by tenant, optionally by role, paginated
├── DTOs/
│   ├── AuthResponseDto.cs                 ← { AccessToken, RefreshToken, ExpiresAt, User: UserDto }
│   └── UserDto.cs                         ← { Id, Email, FirstName, LastName, Role, TenantId, CompanyId, IsActive }
└── Extensions/
    └── AuthModuleExtensions.cs            ← services.AddMediatR(typeof(RegisterUserCommand).Assembly)
```

**Business Logic Deep Dive:**

**RegisterUser Flow:**
```
1. Validate input (FluentValidation runs automatically via MediatR pipeline)
2. Check: Does the caller's role allow creating this target role?
   - SuperAdmin creating CompanyAdmin → ✅ allowed
   - CompanyAdmin creating SuperAdmin → ❌ ForbiddenException
   - CompanyAdmin creating Employee in another company → ❌ ForbiddenException
3. Check: Is email unique within this tenant?
   - If duplicate → ConflictException("Email already registered")
4. Hash password with BCrypt (cost factor 12)
5. Create ApplicationUser entity
6. Save to database
7. Return UserDto (no token — they must login separately)
```

**LoginUser Flow:**
```
1. Validate input
2. Find user by email (ignore tenant filter — login is pre-tenant context)
3. User not found → NotFoundException("Invalid credentials") — never reveal "email not found"
4. Verify password hash
5. Password wrong → same generic "Invalid credentials" — prevent email enumeration
6. User not active → ForbiddenException("Account is deactivated")
7. Generate JWT access token (15 min expiry)
8. Generate refresh token (7 day expiry, stored in DB)
9. Return AuthResponseDto { AccessToken, RefreshToken, ExpiresAt, User }
```

**RefreshToken Flow:**
```
1. Find refresh token in database
2. Token not found or expired or revoked → UnauthorizedException
3. Generate new access token
4. Generate new refresh token
5. Revoke old refresh token (rotation — prevents token reuse attacks)
6. Return new AuthResponseDto
```

**Why These Security Decisions:**

| Decision | Rationale |
|----------|-----------|
| Generic "Invalid credentials" error | Prevents email enumeration attacks — attacker can't discover which emails are registered |
| BCrypt cost factor 12 | Industry standard. Each hash takes ~250ms — fast enough for login, slow enough to resist brute force |
| Refresh token rotation | If a refresh token is stolen, it can only be used ONCE. Second use invalidates the entire chain. |
| 15 min access token | Short-lived JWTs reduce the window of compromise. Refresh token handles renewal silently. |
| Role in JWT claims | RBAC decisions happen per-request without hitting the database. The `[RequireRole]` attribute reads directly from the token. |

**CHECKPOINT:**
- ✅ `dotnet build Modules/Xorva.Modules.Auth` compiles
- ✅ Auth references ONLY Xorva.Core (verify `.csproj` — no Infrastructure reference)
- ✅ RegisterUser handler enforces role hierarchy
- ✅ LoginUser returns generic error messages (no information leakage)
- ✅ All validators defined and thorough

**TIME:** 1.5 hours

---

### Step 7: Build API Layer

**WHAT:** The API host — the entry point that wires everything together. Controllers, middleware pipeline, error handling.

**WHO:** Antigravity generates all files. You review `Program.cs` carefully — this is the nervous system.

**Files Created:**

```
Xorva.API/
├── Program.cs                             ← THE entry point — DI container + middleware pipeline
├── appsettings.json                       ← Connection string, JWT settings, CORS origins
├── appsettings.Development.json           ← Development overrides
├── Controllers/
│   └── AuthController.cs                  ← Thin routing layer: HTTP → MediatR → Response
├── Middleware/
│   ├── ExceptionMiddleware.cs             ← Global exception → ApiResponse error mapping
│   ├── TenantResolverMiddleware.cs        ← Extract TenantId from JWT → set on scoped service
│   └── RequestLoggingMiddleware.cs        ← Log method, path, status, duration
└── Filters/
    └── RequireRoleAttribute.cs            ← [RequireRole(SystemRole.CompanyAdmin)] authorization
```

**Critical: The Middleware Pipeline Order**

The order of middleware in `Program.cs` is **absolutely critical**. Wrong order = security holes or broken functionality.

```
Request →
  1. ExceptionMiddleware          ← Catches ALL unhandled exceptions, returns ApiResponse
  2. RequestLoggingMiddleware     ← Logs every request (method, path, duration, status)
  3. CORS                        ← Allow frontend origin
  4. Authentication (JWT Bearer) ← Validates JWT token, populates HttpContext.User
  5. TenantResolverMiddleware    ← Reads TenantId/CompanyId from JWT claims, sets on scoped service
  6. Authorization               ← Checks [RequireRole] attributes
  7. Swagger (dev only)          ← API documentation UI
  8. Controllers                 ← Route to controller → MediatR → handler → response
→ Response
```

> [!WARNING]
> If `TenantResolverMiddleware` runs BEFORE `Authentication`, it will fail — there are no JWT claims yet. If `ExceptionMiddleware` runs AFTER controllers, unhandled exceptions crash the app instead of returning proper error responses. **Order matters.**

**AuthController Design (Thin Controller):**

```
AuthController:
  POST /api/auth/register    → Send RegisterUserCommand to MediatR → return ApiResponse<UserDto>
  POST /api/auth/login       → Send LoginUserCommand to MediatR    → return ApiResponse<AuthResponseDto>
  POST /api/auth/refresh     → Send RefreshTokenCommand to MediatR → return ApiResponse<AuthResponseDto>
  GET  /api/auth/me          → Send GetCurrentUserQuery to MediatR → return ApiResponse<UserDto>
  GET  /api/users            → Send GetUsersByRoleQuery to MediatR → return ApiResponse<PagedResult<UserDto>>
  PUT  /api/users/{id}/role  → Send ChangeUserRoleCommand (future) → return ApiResponse<UserDto>
```

The controller has **zero business logic**. It maps HTTP to MediatR and MediatR result to HTTP response. If you see business logic in a controller, it's wrong.

**appsettings.json Structure:**

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "postgresql://...@neon.tech/neondb?sslmode=require"
  },
  "JwtSettings": {
    "SecretKey": "...(64+ char random string)...",
    "Issuer": "XorvaERP",
    "Audience": "XorvaERP",
    "AccessTokenExpirationMinutes": 15,
    "RefreshTokenExpirationDays": 7
  },
  "CorsSettings": {
    "AllowedOrigins": ["http://localhost:5173"]
  }
}
```

> [!NOTE]
> `localhost:5173` is Vite's default dev server port. This CORS setting allows the React frontend to call the .NET backend during development.

**RequireRoleAttribute Design:**

```
[RequireRole(SystemRole.CompanyAdmin)]        ← Only CompanyAdmin and above can access
[RequireRole(SystemRole.SuperAdmin)]          ← Only SuperAdmin and SystemAdmin can access
[RequireRole(SystemRole.Employee)]            ← Anyone authenticated can access (Employee is lowest)
```

The attribute checks: `userRole <= requiredRole` (lower enum value = higher privilege). SystemAdmin (0) passes every check. Employee (4) only passes `RequireRole(Employee)`.

**CHECKPOINT:**
- ✅ `dotnet build` from `backend/` compiles the entire solution with 0 errors
- ✅ `Program.cs` has middleware in correct order
- ✅ Controller has NO business logic — only MediatR send
- ✅ `appsettings.json` has connection string, JWT settings, CORS

**TIME:** 45 minutes

---

### Step 8: BUILD CHECKPOINT 🔨

**WHAT:** First full compilation. This is a hard stop — we do NOT proceed until this passes.

**WHO:** You run in **VS Code Terminal**.

**Command:**
```bash
cd c:\Users\HP\Desktop\xorvaErp\backend
dotnet build
```

**Expected Output:**
```
Build succeeded.
    0 Warning(s)
    0 Error(s)
```

**If Errors Occur — Common Issues and Fixes:**

| Error | Cause | Fix |
|-------|-------|-----|
| `CS0246: type or namespace 'MediatR' not found` | Missing package | `dotnet add [project] package MediatR` |
| `CS0234: namespace 'Xorva.Core' does not exist` | Missing project reference | `dotnet add [project] reference Xorva.Core` |
| `CS0103: 'DbContext' does not exist` | Missing EF Core package | `dotnet add Xorva.Infrastructure package Microsoft.EntityFrameworkCore` |
| `CS8019: Unnecessary using directive` | Warning, not error | Ignore or remove the using statement |
| Ambiguous reference errors | Two packages export same type | Add explicit `using` alias |

**We iterate here.** Antigravity reads the error output, generates fixes, you rebuild. Loop until 0 errors.

**CHECKPOINT:**
- ✅ `dotnet build` = **Build succeeded, 0 errors**
- ✅ This is a **HARD GATE** — nothing else happens until this passes

**TIME:** 10–30 minutes (depends on errors)

---

### Step 9: Database Migration + Connection

**WHAT:** Create EF Core migration from our entities, apply it to the Neon PostgreSQL database, verify tables exist, seed the SystemAdmin user.

**WHO:** You run EF Core CLI commands in **VS Code Terminal**.

**Sequence:**

```
Step 9a: Create migration
→ dotnet ef migrations add InitialCreate --project Xorva.Infrastructure --startup-project Xorva.API

Step 9b: Apply to Neon database
→ dotnet ef database update --project Xorva.Infrastructure --startup-project Xorva.API

Step 9c: Verify tables created
→ Check Neon console or use psql: \dt should show Users, RefreshTokens tables

Step 9d: Seed SystemAdmin user
→ Antigravity creates a seed method OR we register via the API directly
```

**Tables Created After Migration:**

| Table | Key Columns |
|-------|-------------|
| `Users` | Id, Email, PasswordHash, FirstName, LastName, Role, TenantId, CompanyId, IsActive, CreatedAt |
| `RefreshTokens` | Id, Token, ExpiresAt, IsRevoked, CreatedAt, UserId (FK → Users) |

**The SystemAdmin Seed:**

We need at least ONE SystemAdmin user to exist before anything else can happen. This user is created during database seeding:

```
Email: admin@xorva.com
Password: (hashed, you choose the password)
Role: SystemAdmin
TenantId: null (SystemAdmin is above tenants)
CompanyId: null
```

This is the "God account" — the platform owner. It creates the first tenant (which creates the first SuperAdmin), and the cascade begins.

**CHECKPOINT:**
- ✅ Migration file created in `Xorva.Infrastructure/Data/Migrations/`
- ✅ `dotnet ef database update` succeeds (no connection errors)
- ✅ Neon console shows tables: `Users`, `RefreshTokens`
- ✅ SystemAdmin user exists in database
- ✅ `dotnet run` from `Xorva.API` starts without crashing (server listening on port)

**TIME:** 15 minutes (assuming Neon connection works)

---

### Step 10: Test Auth Endpoints 🧪

**WHAT:** Hit every auth endpoint with real HTTP requests. Verify request/response contracts.

**WHO:** You use **Postman**, **Thunder Client** (VS Code extension), or **curl**. Antigravity provides exact request bodies.

**Pre-Condition:** API running (`dotnet run` from `Xorva.API/`)

**Test Sequence (Run In This Exact Order):**

---

**Test 1: Register a SuperAdmin (as SystemAdmin)**

```
POST http://localhost:5xxx/api/auth/register
Headers: none (first user is seeded, this registers via seed or open registration)

Body:
{
  "email": "ceo@rightsource.com",
  "password": "RightSource@2026",
  "firstName": "Mohammed",
  "lastName": "Al-Rashid",
  "role": 1,                    // SuperAdmin
  "tenantName": "RightSource Group"
}

Expected Response (201):
{
  "success": true,
  "data": {
    "id": "guid...",
    "email": "ceo@rightsource.com",
    "firstName": "Mohammed",
    "lastName": "Al-Rashid",
    "role": 1,
    "tenantId": "guid...",
    "isActive": true
  },
  "message": "User registered successfully"
}
```

**Verify:** ✅ 201 status, ✅ user data returned, ✅ no password in response

---

**Test 2: Login**

```
POST http://localhost:5xxx/api/auth/login

Body:
{
  "email": "ceo@rightsource.com",
  "password": "RightSource@2026"
}

Expected Response (200):
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "random-guid-string",
    "expiresAt": "2026-07-14T04:15:00Z",
    "user": { ...UserDto... }
  }
}
```

**Verify:** ✅ 200 status, ✅ JWT token returned, ✅ refresh token returned

**SAVE the accessToken — you'll use it for authenticated requests.**

---

**Test 3: Get Current User (Authenticated)**

```
GET http://localhost:5xxx/api/auth/me
Headers:
  Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

Expected Response (200):
{
  "success": true,
  "data": { ...UserDto of logged-in user... }
}
```

**Verify:** ✅ Returns the correct user data matching the JWT

---

**Test 4: Access Protected Endpoint Without Token**

```
GET http://localhost:5xxx/api/auth/me
Headers: none

Expected Response (401):
{
  "success": false,
  "message": "Unauthorized"
}
```

**Verify:** ✅ 401 status — proves JWT authentication is enforced

---

**Test 5: Refresh Token**

```
POST http://localhost:5xxx/api/auth/refresh

Body:
{
  "refreshToken": "the-refresh-token-from-login"
}

Expected Response (200):
{
  "success": true,
  "data": {
    "accessToken": "NEW-jwt-token...",
    "refreshToken": "NEW-refresh-token...",
    "expiresAt": "...",
    "user": { ... }
  }
}
```

**Verify:** ✅ New tokens returned, ✅ old refresh token is now invalid (try using it again → should fail)

---

**Test 6: Role-Based Access (Negative Test)**

```
Register an Employee user, login as Employee, try to access admin-only endpoint.

Expected: 403 Forbidden
```

**Verify:** ✅ RBAC enforcement working — Employee can't access CompanyAdmin endpoints

---

**CHECKPOINT:**
- ✅ All 6 tests pass
- ✅ JWT token generation works
- ✅ Refresh token rotation works (old token invalidated)
- ✅ RBAC blocks unauthorized roles
- ✅ Error responses are generic (no information leakage)
- ✅ **Backend Auth is COMPLETE** 🎉

**TIME:** 30 minutes

---

## Phase C — Frontend Auth (Steps 11–14)

> Now that the backend is proven working, we build the React frontend.

---

### Step 11: Create Frontend Project

**WHAT:** Initialize React + Vite + TypeScript project with all required packages.

**WHO:** You run `npm` commands in **VS Code Terminal** from `frontend/` directory. Antigravity provides exact commands.

**Packages Installed:**

| Category | Packages |
|----------|----------|
| **UI Framework** | `antd` (Ant Design 5) |
| **Styling** | `tailwindcss`, `postcss`, `autoprefixer` |
| **HTTP Client** | `axios` |
| **Data Fetching** | `@tanstack/react-query` |
| **Routing** | `react-router-dom` |
| **Internationalization** | `i18next`, `react-i18next` |
| **Icons** | `@tabler/icons-react` |
| **Dev** | `@types/node` |

**CHECKPOINT:**
- ✅ `npm run dev` starts Vite dev server on `localhost:5173`
- ✅ Browser shows default Vite React page
- ✅ No console errors

**TIME:** 15 minutes

---

### Step 12: Configure Xorva Theme

**WHAT:** Set up the dark theme with Xorva brand colors, Tailwind config, Ant Design theme override, and global CSS.

**WHO:** Antigravity generates all config and style files.

**What Gets Configured:**

| Item | Details |
|------|---------|
| **CSS Variables** | `--bg-void: #0A0A0F`, `--bg-abyss: #13131C`, `--bg-surface: #1E1E2E`, `--color-purple: #7C6FE0`, `--color-glow: #A78BFA`, `--text-primary: #E2E2F0` |
| **Tailwind Config** | Extend colors with Xorva palette, configure Inter font |
| **Ant Design Theme** | Override `token.colorPrimary = '#7C6FE0'`, dark algorithm, custom border radius |
| **Global CSS** | Body background `#0A0A0F`, scrollbar styling, transition defaults |
| **Google Fonts** | Inter (400, 500, 600, 700, 800) loaded in `index.html` |

**CHECKPOINT:**
- ✅ Browser shows dark background (`#0A0A0F`)
- ✅ Any Ant Design button shows purple (`#7C6FE0`)
- ✅ Text is Frost white (`#E2E2F0`)
- ✅ Inter font loaded

**TIME:** 30 minutes

---

### Step 13: Build Login & Register Pages

**WHAT:** Two full-page forms with Xorva branding, validation, error handling, and API integration.

**WHO:** Antigravity generates all components. You review the visual result in browser.

**Login Page Design:**

```
┌─────────────────────────────────────────────────────────┐
│                    (full dark background #0A0A0F)        │
│                                                          │
│              ┌──────────────────────────┐                │
│              │  Xorva Logo + "ERP"      │                │
│              │                          │                │
│              │  Card (#13131C)          │                │
│              │  ┌────────────────────┐  │                │
│              │  │ Email input        │  │                │
│              │  └────────────────────┘  │                │
│              │  ┌────────────────────┐  │                │
│              │  │ Password input     │  │                │
│              │  └────────────────────┘  │                │
│              │                          │                │
│              │  [  Sign In  (#7C6FE0) ] │                │
│              │                          │                │
│              │  Don't have an account?  │                │
│              │  Register →              │                │
│              └──────────────────────────┘                │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Features:**
- Form validation (email format, password min length) — client-side
- Loading spinner on submit button
- Error message display from API (wrong password, user not found)
- "Remember me" checkbox (stores refresh token in localStorage vs sessionStorage)
- Redirect to Dashboard on successful login
- Responsive — works on desktop and tablet

**Register Page Design:**
- First Name, Last Name, Email, Password, Confirm Password
- Same dark card design
- Client-side validation matching backend validators
- Success → redirect to Login with "Account created" toast

**CHECKPOINT:**
- ✅ Login page renders with Xorva dark theme
- ✅ Can type in email and password fields
- ✅ Submit calls `POST /api/auth/login` (verify in browser DevTools Network tab)
- ✅ Successful login stores JWT and redirects to dashboard route
- ✅ Failed login shows error message
- ✅ Register page works and creates user in database

**TIME:** 1.5 hours

---

### Step 14: Build Auth Infrastructure (Context + Guards + Routing)

**WHAT:** The plumbing that makes auth work across the entire frontend app.

**WHO:** Antigravity generates all files.

**Files Created:**

| File | Purpose |
|------|---------|
| `stores/AuthContext.tsx` | React Context holding: `user`, `accessToken`, `isAuthenticated`, `login()`, `logout()`, `refreshToken()` |
| `api/client.ts` | Axios instance with JWT interceptor — automatically attaches `Authorization: Bearer` header to every request. Intercepts 401 responses → attempt token refresh → retry original request. |
| `api/auth.api.ts` | `loginApi(email, password)`, `registerApi(...)`, `getCurrentUser()`, `refreshTokenApi(token)` |
| `components/ProtectedRoute.tsx` | Wrapper that checks `isAuthenticated` — if not, redirect to `/login` |
| `router/index.tsx` | Route definitions: `/login`, `/register`, `/dashboard` (protected), `/` redirect |
| `utils/roleGuards.ts` | `canAccess(userRole, requiredRole)` — mirrors backend RBAC logic |

**Auth Flow Diagram:**

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant AuthContext
    participant AxiosClient
    participant API

    User->>Browser: Opens /dashboard
    Browser->>AuthContext: Check isAuthenticated?
    AuthContext-->>Browser: No → redirect to /login
    User->>Browser: Enters email + password
    Browser->>API: POST /api/auth/login
    API-->>Browser: { accessToken, refreshToken, user }
    Browser->>AuthContext: Store tokens + user
    AuthContext-->>Browser: isAuthenticated = true
    Browser->>Browser: Redirect to /dashboard
    Browser->>AxiosClient: GET /api/some-data
    AxiosClient->>AxiosClient: Attach Authorization: Bearer header
    AxiosClient->>API: GET /api/some-data + JWT
    API-->>Browser: Data
    Note over AxiosClient,API: 15 min later, token expires...
    Browser->>AxiosClient: GET /api/some-data
    AxiosClient->>API: GET /api/some-data + expired JWT
    API-->>AxiosClient: 401 Unauthorized
    AxiosClient->>API: POST /api/auth/refresh (automatic)
    API-->>AxiosClient: New tokens
    AxiosClient->>AxiosClient: Store new tokens
    AxiosClient->>API: Retry original request with new JWT
    API-->>Browser: Data (transparent to user)
```

The user NEVER sees a "session expired" message during normal use. The Axios interceptor handles token refresh silently.

**CHECKPOINT:**
- ✅ Unauthenticated user visiting `/dashboard` is redirected to `/login`
- ✅ After login, user is redirected to `/dashboard`
- ✅ Refreshing the browser page maintains login state (tokens in localStorage)
- ✅ API calls automatically include JWT header (verify in DevTools)
- ✅ Logout clears tokens and redirects to `/login`

**TIME:** 1 hour

---

## Phase D — Quality & Context (Steps 15–16)

> Tests and documentation. What separates professional delivery from a prototype.

---

### Step 15: Unit Tests

**WHAT:** Test the auth command handlers in isolation (no database, no HTTP).

**WHO:** Antigravity generates test files. You run `dotnet test` in VS Code.

**What We Test:**

| Test | What It Verifies |
|------|-----------------|
| `RegisterUser_WithValidData_CreatesUser` | Happy path — user created successfully |
| `RegisterUser_WithDuplicateEmail_ThrowsConflict` | Email uniqueness enforced |
| `RegisterUser_CompanyAdmin_CannotCreateSuperAdmin` | Role hierarchy enforced |
| `LoginUser_WithValidCredentials_ReturnsTokens` | Login works, tokens generated |
| `LoginUser_WithWrongPassword_ThrowsNotFound` | Generic error, no info leakage |
| `LoginUser_InactiveUser_ThrowsForbidden` | Deactivated accounts blocked |
| `RefreshToken_WithValidToken_ReturnsNewTokens` | Token rotation works |
| `RefreshToken_WithRevokedToken_ThrowsUnauthorized` | Revoked tokens rejected |

**Test Structure:**

```
Tests/Xorva.Tests.Unit/
└── Auth/
    ├── RegisterUserCommandHandlerTests.cs
    ├── LoginUserCommandHandlerTests.cs
    └── RefreshTokenCommandHandlerTests.cs
```

**Mock Strategy:**
- Mock `XorvaDbContext` (use in-memory provider or mock `DbSet`)
- Mock `IJwtTokenService` (return predictable tokens)
- Mock `IPasswordHasher` (return predictable hashes)
- Real `FluentValidation` validators (test them too)

**CHECKPOINT:**
- ✅ `dotnet test` from `backend/` passes all tests
- ✅ 8+ test cases covering happy paths and error cases
- ✅ No tests depend on real database or external services

**TIME:** 45 minutes

---

### Step 16: Create Context Files

**WHAT:** Initialize the 5 context files that track project state for future AI agent sessions.

**WHO:** Antigravity creates all files.

**Files Created:**

| File | Day 1 Content |
|------|--------------|
| `context/PROGRESS.md` | Phase 1 checklist — Auth items ✅, everything else ❌ |
| `context/ARCHITECTURE.md` | Solution structure, dependency graph, patterns used, conventions |
| `context/API_CONTRACTS.md` | All auth endpoints with exact request/response JSON shapes |
| `context/DATABASE_SCHEMA.md` | Users and RefreshTokens tables with all columns |
| `context/DAILY_LOG.md` | Day 1 log — what was built, hours spent, decisions made, blockers |

**CHECKPOINT:**
- ✅ All 5 files exist in `context/`
- ✅ PROGRESS.md accurately reflects what's done
- ✅ Any AI agent reading these files can understand the project state without additional explanation

**TIME:** 15 minutes

---

## Day 1 Summary — What We'll Have at End of Day

### Backend ✅
- .NET 10 Modular Monolith solution with 8 projects
- Auth module: Register, Login, RefreshToken, GetCurrentUser, GetUsersByRole
- RBAC with 5-level role hierarchy
- Multi-tenant DbContext with global query filters
- JWT access + refresh token system
- Exception middleware with consistent ApiResponse
- Swagger API documentation

### Database ✅
- PostgreSQL on Neon connected
- Users + RefreshTokens tables created
- SystemAdmin seed user exists

### Frontend ✅
- React + Vite + TypeScript project with Xorva dark theme
- Login page + Register page (Ant Design + Tailwind)
- Auth context with token management
- Axios interceptor with silent token refresh
- Protected routes + role-based guards
- Connected to backend API

### Testing ✅
- 8+ unit tests for auth handlers
- Manual API testing confirmed (all 6 test scenarios)

### Context ✅
- PROGRESS.md, ARCHITECTURE.md, API_CONTRACTS.md, DATABASE_SCHEMA.md, DAILY_LOG.md
- Ready for any AI agent to pick up tomorrow

---

> [!IMPORTANT]
> ## Ready to Execute?
> 
> **Say "start" and I begin Step 1 — creating the folder structure.**
> 
> We work step by step. I execute one step, you verify the checkpoint, we move to the next. Professional. Disciplined. No shortcuts.
