-- ============================================================================
-- Xorva Accounting — ported from TrueLedge (supabase/migrations/00001, §7 RLS helpers)
-- Script 0001: application session context + RLS helper functions
-- ============================================================================
-- TrueLedge scoped every row with Supabase primitives:
--     auth.uid()                                → the caller
--     auth.jwt() -> 'app_metadata' -> 'entity_ids' → the entities the caller may touch
--     has_entity_access(entity_id)              → the RLS predicate
--
-- Xorva has no Supabase `auth` schema. The API authenticates with its own JWT and
-- resolves the caller into ICurrentTenantService (TenantResolverMiddleware). This
-- script gives the database the same information through per-connection settings,
-- which the API applies with `SELECT app.set_session_context(...)` when it opens a
-- connection (AppSessionContextInterceptor). Npgsql resets session state (DISCARD ALL)
-- when a connection returns to the pool, so a stale context can never leak between
-- requests.
--
-- Everything ported from TrueLedge lives in schema `accounting`; the helpers that are
-- platform-wide live in schema `app`.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- gen_random_uuid() (already core on PG13+, kept for parity)

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS accounting;

-- ----------------------------------------------------------------------------
-- 1. Session context (replaces auth.uid() / auth.jwt())
-- ----------------------------------------------------------------------------
-- Uses set_config(..., is_local => false) so the values survive for the whole
-- connection (not just the current transaction); the pool reset clears them.

CREATE OR REPLACE FUNCTION app.set_session_context(
  p_user_id            UUID,
  p_tenant_id          UUID,
  p_company_id         UUID,
  p_role               INT,          -- Xorva.Core.Enums.SystemRole (0 = SystemAdmin … 4 = Employee)
  p_cross_company      BOOLEAN       -- ICurrentTenantService.HasCrossCompanyAccess
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('app.user_id',       COALESCE(p_user_id::text, ''),    false);
  PERFORM set_config('app.tenant_id',     COALESCE(p_tenant_id::text, ''),  false);
  PERFORM set_config('app.company_id',    COALESCE(p_company_id::text, ''), false);
  PERFORM set_config('app.role',          COALESCE(p_role::text, '4'),      false);
  PERFORM set_config('app.cross_company', CASE WHEN p_cross_company THEN 'true' ELSE 'false' END, false);
END;
$$;

COMMENT ON FUNCTION app.set_session_context IS
  'Called by the API once per connection to publish the authenticated caller to RLS policies and RPCs. Replaces Supabase auth.uid()/auth.jwt().';

CREATE OR REPLACE FUNCTION app.clear_session_context()
RETURNS VOID
LANGUAGE sql
AS $$
  SELECT app.set_session_context(NULL, NULL, NULL, 4, false);
$$;

-- Nullable readers. current_setting(name, missing_ok => true) returns NULL when the
-- setting was never set on this connection and '' after clear_session_context().
CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app.current_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app.current_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.company_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app.current_role_value()
RETURNS INT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('app.role', true), '')::int, 4);   -- default Employee (least privilege)
$$;

CREATE OR REPLACE FUNCTION app.has_cross_company_access()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('app.cross_company', true), '')::boolean, false);
$$;

-- ----------------------------------------------------------------------------
-- 2. Row-access predicate (replaces has_entity_access / is_entity_member)
-- ----------------------------------------------------------------------------
-- Mirrors the EF global filter in XorvaDbContext exactly:
--   TenantEntity  → TenantId == current
--   CompanyEntity → TenantId == current AND (HasCrossCompanyAccess OR CompanyId == current)
-- A connection with NO context (migrations, DbInitializer seeding, background jobs
-- running as the table owner) is not subject to RLS because Xorva's application role
-- owns the tables and FORCE ROW LEVEL SECURITY is deliberately NOT used — see §3.

CREATE OR REPLACE FUNCTION app.has_company_access(p_tenant_id UUID, p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT p_tenant_id IS NOT NULL
     AND p_tenant_id = app.current_tenant_id()
     AND (app.has_cross_company_access() OR p_company_id = app.current_company_id());
$$;

COMMENT ON FUNCTION app.has_company_access IS
  'RLS predicate for CompanyEntity tables. Same rule as the EF Core global query filter; RLS is the second, database-level layer.';

-- ----------------------------------------------------------------------------
-- 3. Policy installer
-- ----------------------------------------------------------------------------
-- TrueLedge wrote four policies per table by hand (select/insert/update/delete on
-- has_entity_access(entity_id)). This helper installs the identical set for any
-- Xorva company-scoped table so the ported scripts stay short and uniform.
--
-- ENABLE (not FORCE) row level security: PostgreSQL exempts the table OWNER from
-- RLS unless FORCE is set. Xorva's API connects as the owner (single application
-- role on Neon) and runs EF migrations/seeding with no session context, so forcing
-- RLS would break startup. Enabling it means: the moment the deployment moves the API
-- to a dedicated non-owner login (the recommended hardening step — see
-- context/ARCHITECTURE.md), the policies become active with no schema change.
-- Policies are also always evaluated for any non-owner role today.

CREATE OR REPLACE FUNCTION app.install_company_rls(p_table REGCLASS)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_name TEXT := replace(p_table::text, '"', '');
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_table);

  EXECUTE format('DROP POLICY IF EXISTS %I ON %s', v_name || '_select', p_table);
  EXECUTE format('DROP POLICY IF EXISTS %I ON %s', v_name || '_insert', p_table);
  EXECUTE format('DROP POLICY IF EXISTS %I ON %s', v_name || '_update', p_table);
  EXECUTE format('DROP POLICY IF EXISTS %I ON %s', v_name || '_delete', p_table);

  EXECUTE format(
    'CREATE POLICY %I ON %s FOR SELECT USING (app.has_company_access("TenantId", "CompanyId"))',
    v_name || '_select', p_table);
  EXECUTE format(
    'CREATE POLICY %I ON %s FOR INSERT WITH CHECK (app.has_company_access("TenantId", "CompanyId"))',
    v_name || '_insert', p_table);
  EXECUTE format(
    'CREATE POLICY %I ON %s FOR UPDATE USING (app.has_company_access("TenantId", "CompanyId")) WITH CHECK (app.has_company_access("TenantId", "CompanyId"))',
    v_name || '_update', p_table);
  EXECUTE format(
    'CREATE POLICY %I ON %s FOR DELETE USING (app.has_company_access("TenantId", "CompanyId"))',
    v_name || '_delete', p_table);
END;
$$;

COMMENT ON FUNCTION app.install_company_rls IS
  'Installs the standard tenant/company RLS policy set on a CompanyEntity table (ported from TrueLedge''s per-table policies).';

-- ----------------------------------------------------------------------------
-- 4. Audit trigger (ported from TrueLedge handle_updated_at)
-- ----------------------------------------------------------------------------
-- Xorva's EF SaveChanges sets CreatedAt/UpdatedAt/CreatedBy/UpdatedBy for entities it
-- tracks; rows written by RPCs bypass EF, so the ported tables also get the trigger.
-- Column names follow Xorva's AuditableEntity.

CREATE OR REPLACE FUNCTION app.handle_audit_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW."CreatedAt" := COALESCE(NEW."CreatedAt", now());
    NEW."CreatedBy" := COALESCE(NEW."CreatedBy", app.current_user_id());
    RETURN NEW;
  END IF;
  NEW."UpdatedAt" := now();
  NEW."UpdatedBy" := COALESCE(app.current_user_id(), NEW."UpdatedBy");
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.install_audit_trigger(p_table REGCLASS)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_name TEXT := replace(p_table::text, '"', '');
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', 'trg_' || v_name || '_audit', p_table);
  EXECUTE format(
    'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION app.handle_audit_columns()',
    'trg_' || v_name || '_audit', p_table);
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Retro-fit RLS on the EXISTING Xorva accounting tables
-- ----------------------------------------------------------------------------
-- The single-ledger decision: ported RPCs write into Xorva's JournalEntries /
-- JournalLines, so the same DB-level isolation must cover them. Additive — no
-- column or constraint on these tables changes.

SELECT app.install_company_rls('"Accounts"');
SELECT app.install_company_rls('"AccountingSettings"');
SELECT app.install_company_rls('"JournalEntries"');
SELECT app.install_company_rls('"JournalLines"');
SELECT app.install_company_rls('"FiscalYears"');
SELECT app.install_company_rls('"FiscalPeriods"');
SELECT app.install_company_rls('"Contacts"');
SELECT app.install_company_rls('"Products"');
SELECT app.install_company_rls('"TaxRates"');
SELECT app.install_company_rls('"BankAccounts"');
SELECT app.install_company_rls('"Invoices"');
SELECT app.install_company_rls('"InvoiceLines"');
SELECT app.install_company_rls('"Bills"');
SELECT app.install_company_rls('"BillLines"');
SELECT app.install_company_rls('"CustomerPayments"');
SELECT app.install_company_rls('"PaymentAllocations"');
SELECT app.install_company_rls('"SupplierPayments"');
SELECT app.install_company_rls('"BillPaymentAllocations"');
SELECT app.install_company_rls('"CreditNotes"');
SELECT app.install_company_rls('"CreditNoteLines"');
SELECT app.install_company_rls('"DebitNotes"');
SELECT app.install_company_rls('"DebitNoteLines"');
SELECT app.install_company_rls('"ExchangeRates"');
SELECT app.install_company_rls('"FixedAssets"');
