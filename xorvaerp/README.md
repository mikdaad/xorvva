# Xorva ERP

Cloud-based, multi-tenant ERP platform. **Phase 1:** Auth + Tenants + Approval Engine + HR.

| Layer | Stack |
|-------|-------|
| Backend | .NET 10 Modular Monolith, ASP.NET Core, EF Core, MediatR (CQRS), FluentValidation, JWT |
| Database | PostgreSQL 16 (Neon) |
| Frontend | React 19, Vite, TypeScript, Tailwind CSS v4 |

## Project layout
- `backend/` — .NET solution (`XorvaERP.slnx`): Core, Infrastructure, API, Modules/, Tests/
- `frontend/` — React app (Vite dev server on :5173, proxies `/api` → :5270)
- `context/` — living project state: PROGRESS, ARCHITECTURE, API_CONTRACTS, DATABASE_SCHEMA, DAILY_LOG
- `docs/` — planning documents and brand guidelines

## Running locally

**Backend** (first time: configure secrets — see below):
```bash
cd backend
dotnet run --project Xorva.API        # http://localhost:5270 (Swagger at /swagger)
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev                           # http://localhost:5173
```

## Secrets (never committed)
Development secrets live in `dotnet user-secrets` for `Xorva.API`:
```bash
cd backend/Xorva.API
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "<neon-connection-string>"
dotnet user-secrets set "JwtSettings:SecretKey" "<random-64+-chars>"
dotnet user-secrets set "SeedSettings:SystemAdminPassword" "<initial-admin-password>"  # only needed on an empty DB
```
Migrations apply automatically at API startup; a SystemAdmin is seeded if none exists.

## Tests
```bash
cd backend
dotnet test
```
