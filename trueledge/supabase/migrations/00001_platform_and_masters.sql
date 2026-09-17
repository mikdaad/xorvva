-- ============================================================================
-- TrueLedge: Multi-Tenant SaaS Accounting Platform
-- Migration 00001: Platform & Masters Core Schema
-- ============================================================================
-- This migration creates:
--   1. Extensions & Custom Types (Enums)
--   2. Platform Tables (organisations, users, org_users, entities, etc.)
--   3. Masters Tables (accounts, parties, items, cost_centres, tax_codes)
--   4. Indexes for RLS and query performance
--   5. Audit trigger function + triggers
--   6. RLS helper functions
--   7. RLS policies on all tables
-- ============================================================================

-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 2. CUSTOM TYPES (ENUMS)
-- ============================================================================
CREATE TYPE public.org_status AS ENUM (
  'active', 'suspended', 'trial', 'cancelled'
);

CREATE TYPE public.entity_type AS ENUM (
  'company', 'sole_establishment', 'free_zone', 'branch', 'partnership'
);

CREATE TYPE public.tax_treatment AS ENUM (
  'registered', 'unregistered', 'designated_zone', 'exempt', 'reverse_charge'
);

CREATE TYPE public.account_type AS ENUM (
  'asset', 'liability', 'equity', 'revenue', 'expense'
);

CREATE TYPE public.account_sub_type AS ENUM (
  'current_asset', 'fixed_asset', 'current_liability', 'long_term_liability',
  'equity_capital', 'retained_earnings', 'operating_revenue', 'other_revenue',
  'cost_of_sales', 'operating_expense', 'other_expense'
);

CREATE TYPE public.party_type AS ENUM (
  'customer', 'supplier', 'both', 'employee'
);

CREATE TYPE public.item_type AS ENUM (
  'inventory', 'service', 'expense', 'fixed_asset'
);

CREATE TYPE public.period_status AS ENUM (
  'open', 'soft_closed', 'hard_closed'
);

CREATE TYPE public.dimension_type AS ENUM (
  'project', 'department', 'location', 'activity', 'segment', 'custom'
);

CREATE TYPE public.tax_scope AS ENUM (
  'vat', 'corporate_tax', 'excise', 'withholding'
);

-- ============================================================================
-- 3. AUDIT TRIGGER FUNCTION
-- ============================================================================
-- Automatically sets updated_at and updated_by on UPDATE operations.
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  -- Set updated_by to the current authenticated user if available
  IF current_setting('request.jwt.claim.sub', true) IS NOT NULL THEN
    NEW.updated_by = (current_setting('request.jwt.claim.sub', true))::uuid;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 4. PLATFORM TABLES
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 4.1 organisations
-- ---------------------------------------------------------------------------
-- Top-level tenant: an accounting firm, holding company, or business group.
CREATE TABLE public.organisations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  status        public.org_status NOT NULL DEFAULT 'trial',
  mfa_required  BOOLEAN NOT NULL DEFAULT false,
  subscription_tier TEXT NOT NULL DEFAULT 'free',
  logo_url      TEXT,
  settings      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID,
  updated_by    UUID
);

CREATE TRIGGER set_organisations_updated_at
  BEFORE UPDATE ON public.organisations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.organisations IS 'Top-level tenant representing an accounting firm or business group.';

-- ---------------------------------------------------------------------------
-- 4.2 users (profile extension of auth.users)
-- ---------------------------------------------------------------------------
CREATE TABLE public.users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT,
  email         TEXT NOT NULL,
  phone         TEXT,
  avatar_url    TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID,
  updated_by    UUID
);

CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.users IS 'Public user profile extending auth.users. Stores display name, avatar, etc.';

-- ---------------------------------------------------------------------------
-- 4.3 roles
-- ---------------------------------------------------------------------------
-- Roles are scoped to an organisation. System roles (admin, viewer) are
-- created during onboarding and cannot be deleted.
CREATE TABLE public.roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID,
  updated_by      UUID,

  CONSTRAINT uq_roles_org_name UNIQUE (organisation_id, name)
);

CREATE TRIGGER set_roles_updated_at
  BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.roles IS 'Role definitions scoped to an organisation. System roles are auto-created.';

-- ---------------------------------------------------------------------------
-- 4.4 role_permissions
-- ---------------------------------------------------------------------------
CREATE TABLE public.role_permissions (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id   UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  resource  TEXT NOT NULL,   -- e.g. 'invoices', 'journal_entries', 'reports'
  action    TEXT NOT NULL,   -- e.g. 'create', 'read', 'update', 'delete', 'approve'

  CONSTRAINT uq_role_perm UNIQUE (role_id, resource, action)
);

COMMENT ON TABLE public.role_permissions IS 'Granular permission grants per role: resource + action pairs.';

-- ---------------------------------------------------------------------------
-- 4.5 organisation_users
-- ---------------------------------------------------------------------------
-- Membership table linking users to organisations with a role.
CREATE TABLE public.organisation_users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_id         UUID REFERENCES public.roles(id) ON DELETE SET NULL,
  is_owner        BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID,
  updated_by      UUID,

  CONSTRAINT uq_org_user UNIQUE (organisation_id, user_id)
);

CREATE TRIGGER set_organisation_users_updated_at
  BEFORE UPDATE ON public.organisation_users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.organisation_users IS 'User membership within an organisation with assigned role.';

-- ---------------------------------------------------------------------------
-- 4.6 entities
-- ---------------------------------------------------------------------------
-- An entity is a client company or business unit under an organisation.
-- This is the primary data isolation boundary for all business data.
CREATE TABLE public.entities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  trade_name      TEXT NOT NULL,
  legal_name      TEXT,
  trn             VARCHAR(15),                     -- UAE Tax Registration Number
  entity_type     public.entity_type NOT NULL DEFAULT 'company',
  tax_treatment   public.tax_treatment NOT NULL DEFAULT 'registered',
  base_currency   VARCHAR(3) NOT NULL DEFAULT 'AED',
  address_line1   TEXT,
  address_line2   TEXT,
  city            TEXT,
  emirate         TEXT,                            -- Dubai, Abu Dhabi, etc.
  country         VARCHAR(2) NOT NULL DEFAULT 'AE',
  phone           TEXT,
  email           TEXT,
  logo_url        TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  settings        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID,
  updated_by      UUID,

  CONSTRAINT uq_entity_org_trade UNIQUE (organisation_id, trade_name)
);

CREATE TRIGGER set_entities_updated_at
  BEFORE UPDATE ON public.entities
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.entities IS 'Client company or business unit. Primary data isolation boundary.';
COMMENT ON COLUMN public.entities.trn IS 'UAE Tax Registration Number (TRN) — 15 digits issued by FTA.';

-- ---------------------------------------------------------------------------
-- 4.7 entity_users
-- ---------------------------------------------------------------------------
-- Controls which users can access which entities. A user may access
-- multiple entities within the same organisation.
CREATE TABLE public.entity_users (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_id   UUID REFERENCES public.roles(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,

  CONSTRAINT uq_entity_user UNIQUE (entity_id, user_id)
);

CREATE TRIGGER set_entity_users_updated_at
  BEFORE UPDATE ON public.entity_users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.entity_users IS 'User access grants per entity. Drives RLS for all business data.';

-- ---------------------------------------------------------------------------
-- 4.8 fiscal_years
-- ---------------------------------------------------------------------------
CREATE TABLE public.fiscal_years (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id  UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,                        -- e.g. 'FY 2026-2027'
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  is_closed  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,

  CONSTRAINT uq_fy_entity_name UNIQUE (entity_id, name),
  CONSTRAINT chk_fy_dates CHECK (end_date > start_date)
);

CREATE TRIGGER set_fiscal_years_updated_at
  BEFORE UPDATE ON public.fiscal_years
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.fiscal_years IS 'Fiscal year definitions per entity. UAE standard: Jan-Dec or custom.';

-- ---------------------------------------------------------------------------
-- 4.9 periods
-- ---------------------------------------------------------------------------
CREATE TABLE public.periods (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year_id UUID NOT NULL REFERENCES public.fiscal_years(id) ON DELETE CASCADE,
  entity_id      UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,                    -- e.g. 'January 2026'
  period_number  SMALLINT NOT NULL,                -- 1-13 (13 for adjustments)
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  status         public.period_status NOT NULL DEFAULT 'open',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID,
  updated_by     UUID,

  CONSTRAINT uq_period_fy_num UNIQUE (fiscal_year_id, period_number),
  CONSTRAINT chk_period_dates CHECK (end_date >= start_date),
  CONSTRAINT chk_period_number CHECK (period_number BETWEEN 1 AND 13)
);

CREATE TRIGGER set_periods_updated_at
  BEFORE UPDATE ON public.periods
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.periods IS 'Accounting periods within a fiscal year. Period 13 is for year-end adjustments.';

-- ============================================================================
-- 5. MASTERS TABLES
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 5.1 currencies (shared reference — NOT entity-scoped)
-- ---------------------------------------------------------------------------
CREATE TABLE public.currencies (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           VARCHAR(3) NOT NULL UNIQUE,       -- ISO 4217
  name           TEXT NOT NULL,
  symbol         TEXT,
  decimal_places SMALLINT NOT NULL DEFAULT 2,
  is_active      BOOLEAN NOT NULL DEFAULT true
);

COMMENT ON TABLE public.currencies IS 'Shared currency reference table (ISO 4217). Not entity-scoped.';

-- Seed common currencies
INSERT INTO public.currencies (code, name, symbol, decimal_places) VALUES
  ('AED', 'UAE Dirham', 'د.إ', 2),
  ('USD', 'US Dollar', '$', 2),
  ('EUR', 'Euro', '€', 2),
  ('GBP', 'British Pound', '£', 2),
  ('SAR', 'Saudi Riyal', '﷼', 2),
  ('INR', 'Indian Rupee', '₹', 2),
  ('BHD', 'Bahraini Dinar', '.د.ب', 3),
  ('OMR', 'Omani Rial', '﷼', 3),
  ('QAR', 'Qatari Riyal', '﷼', 2),
  ('KWD', 'Kuwaiti Dinar', 'د.ك', 3),
  ('EGP', 'Egyptian Pound', '£', 2),
  ('PKR', 'Pakistani Rupee', '₨', 2),
  ('BDT', 'Bangladeshi Taka', '৳', 2),
  ('PHP', 'Philippine Peso', '₱', 2),
  ('CNY', 'Chinese Yuan', '¥', 2);

-- ---------------------------------------------------------------------------
-- 5.2 accounts (Chart of Accounts)
-- ---------------------------------------------------------------------------
CREATE TABLE public.accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  code            VARCHAR(20) NOT NULL,
  name            TEXT NOT NULL,
  name_ar         TEXT,                             -- Arabic name for UAE compliance
  account_type    public.account_type NOT NULL,
  account_sub_type public.account_sub_type,
  parent_id       UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  level           SMALLINT NOT NULL DEFAULT 1,
  is_group        BOOLEAN NOT NULL DEFAULT false,   -- Group accounts cannot be posted to
  is_control      BOOLEAN NOT NULL DEFAULT false,   -- Control account (linked to sub-ledger)
  is_bank         BOOLEAN NOT NULL DEFAULT false,   -- Bank account
  is_system       BOOLEAN NOT NULL DEFAULT false,   -- System-generated, cannot be deleted
  currency_code   VARCHAR(3) DEFAULT 'AED',
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID,
  updated_by      UUID,

  CONSTRAINT uq_account_entity_code UNIQUE (entity_id, code)
);

CREATE TRIGGER set_accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.accounts IS 'Chart of Accounts per entity. Supports hierarchical structure with control/bank flags.';
COMMENT ON COLUMN public.accounts.is_control IS 'When true, this account is a control account linked to a sub-ledger (AR/AP).';
COMMENT ON COLUMN public.accounts.is_bank IS 'When true, this account represents a bank account for reconciliation.';

-- ---------------------------------------------------------------------------
-- 5.3 tax_codes
-- ---------------------------------------------------------------------------
CREATE TABLE public.tax_codes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id  UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  code       VARCHAR(20) NOT NULL,
  name       TEXT NOT NULL,
  rate       NUMERIC(7, 4) NOT NULL DEFAULT 0,      -- e.g. 5.0000 for 5% VAT
  tax_scope  public.tax_scope NOT NULL DEFAULT 'vat',
  fta_code   VARCHAR(20),                           -- FTA reporting code mapping
  account_id UUID REFERENCES public.accounts(id),   -- Tax liability/asset account
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,

  CONSTRAINT uq_tax_code_entity UNIQUE (entity_id, code)
);

CREATE TRIGGER set_tax_codes_updated_at
  BEFORE UPDATE ON public.tax_codes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.tax_codes IS 'Tax code master with FTA mapping. Supports VAT (5%), zero-rated, exempt, reverse charge.';
COMMENT ON COLUMN public.tax_codes.fta_code IS 'Mapping to FTA e-invoicing and VAT return box codes.';

-- ---------------------------------------------------------------------------
-- 5.4 parties (Customers / Suppliers)
-- ---------------------------------------------------------------------------
CREATE TABLE public.parties (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  party_type          public.party_type NOT NULL DEFAULT 'customer',
  code                VARCHAR(20),
  name                TEXT NOT NULL,
  name_ar             TEXT,                          -- Arabic name
  trn                 VARCHAR(15),                   -- Counter-party TRN
  tax_treatment       public.tax_treatment NOT NULL DEFAULT 'registered',
  control_account_id  UUID REFERENCES public.accounts(id),  -- AR or AP control account
  default_tax_code_id UUID REFERENCES public.tax_codes(id),
  credit_limit        NUMERIC(19, 4) DEFAULT 0,
  payment_terms_days  SMALLINT DEFAULT 30,
  contact_person      TEXT,
  email               TEXT,
  phone               TEXT,
  address_line1       TEXT,
  address_line2       TEXT,
  city                TEXT,
  country             VARCHAR(2) DEFAULT 'AE',
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID,
  updated_by          UUID,

  CONSTRAINT uq_party_entity_code UNIQUE (entity_id, code)
);

CREATE TRIGGER set_parties_updated_at
  BEFORE UPDATE ON public.parties
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.parties IS 'Customer and supplier master. Stores TRN and default tax treatment for UAE compliance.';

-- ---------------------------------------------------------------------------
-- 5.5 items (Products / Services)
-- ---------------------------------------------------------------------------
CREATE TABLE public.items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id          UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  item_type          public.item_type NOT NULL DEFAULT 'service',
  code               VARCHAR(30) NOT NULL,
  name               TEXT NOT NULL,
  name_ar            TEXT,
  description        TEXT,
  unit_of_measure    VARCHAR(20) DEFAULT 'EA',      -- EA, HR, KG, M2, etc.
  purchase_account_id UUID REFERENCES public.accounts(id),
  sales_account_id   UUID REFERENCES public.accounts(id),
  tax_code_id        UUID REFERENCES public.tax_codes(id),
  default_price      NUMERIC(19, 4),
  hsn_code           VARCHAR(20),                   -- Harmonized System code
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID,
  updated_by         UUID,

  CONSTRAINT uq_item_entity_code UNIQUE (entity_id, code)
);

CREATE TRIGGER set_items_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.items IS 'Product and service master for invoicing and procurement.';

-- ---------------------------------------------------------------------------
-- 5.6 cost_centre_dimensions
-- ---------------------------------------------------------------------------
-- Defines the TYPES of cost centre dimensions available for an entity.
-- e.g. "Project", "Department", "Location", "Activity"
CREATE TABLE public.cost_centre_dimensions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id      UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  dimension_type public.dimension_type NOT NULL DEFAULT 'custom',
  name           TEXT NOT NULL,
  code           VARCHAR(20) NOT NULL,
  description    TEXT,
  is_mandatory   BOOLEAN NOT NULL DEFAULT false,    -- Must be selected on transactions
  is_active      BOOLEAN NOT NULL DEFAULT true,
  sort_order     SMALLINT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID,
  updated_by     UUID,

  CONSTRAINT uq_dimension_entity_code UNIQUE (entity_id, code)
);

CREATE TRIGGER set_cost_centre_dimensions_updated_at
  BEFORE UPDATE ON public.cost_centre_dimensions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.cost_centre_dimensions IS 'Dimension type definitions for cost centres. Supports contracting project reporting.';

-- ---------------------------------------------------------------------------
-- 5.7 cost_centres
-- ---------------------------------------------------------------------------
-- Actual cost centre values within a dimension. Supports hierarchy.
CREATE TABLE public.cost_centres (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id    UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  dimension_id UUID NOT NULL REFERENCES public.cost_centre_dimensions(id) ON DELETE CASCADE,
  code         VARCHAR(30) NOT NULL,
  name         TEXT NOT NULL,
  parent_id    UUID REFERENCES public.cost_centres(id) ON DELETE SET NULL,
  level        SMALLINT NOT NULL DEFAULT 1,
  is_group     BOOLEAN NOT NULL DEFAULT false,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  budget       NUMERIC(19, 4),
  start_date   DATE,
  end_date     DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID,
  updated_by   UUID,

  CONSTRAINT uq_cc_entity_dim_code UNIQUE (entity_id, dimension_id, code)
);

CREATE TRIGGER set_cost_centres_updated_at
  BEFORE UPDATE ON public.cost_centres
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.cost_centres IS 'Cost centre values within a dimension. Hierarchical for drill-down reporting.';

-- ============================================================================
-- 6. INDEXES
-- ============================================================================
-- RLS performance: every entity-scoped table needs an index on entity_id.
-- Organisation-scoped tables need an index on organisation_id.
-- Composite indexes for common query patterns.

-- Platform indexes
CREATE INDEX idx_org_users_org      ON public.organisation_users (organisation_id);
CREATE INDEX idx_org_users_user     ON public.organisation_users (user_id);
CREATE INDEX idx_entities_org       ON public.entities (organisation_id);
CREATE INDEX idx_entity_users_entity ON public.entity_users (entity_id);
CREATE INDEX idx_entity_users_user  ON public.entity_users (user_id);
CREATE INDEX idx_roles_org          ON public.roles (organisation_id);
CREATE INDEX idx_role_perms_role    ON public.role_permissions (role_id);

-- Fiscal / Period indexes
CREATE INDEX idx_fiscal_years_entity ON public.fiscal_years (entity_id);
CREATE INDEX idx_periods_entity      ON public.periods (entity_id);
CREATE INDEX idx_periods_fy          ON public.periods (fiscal_year_id);
CREATE INDEX idx_periods_dates       ON public.periods (entity_id, start_date, end_date);

-- Masters indexes
CREATE INDEX idx_accounts_entity     ON public.accounts (entity_id);
CREATE INDEX idx_accounts_parent     ON public.accounts (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_accounts_type       ON public.accounts (entity_id, account_type);
CREATE INDEX idx_accounts_control    ON public.accounts (entity_id) WHERE is_control = true;
CREATE INDEX idx_accounts_bank       ON public.accounts (entity_id) WHERE is_bank = true;

CREATE INDEX idx_parties_entity      ON public.parties (entity_id);
CREATE INDEX idx_parties_type        ON public.parties (entity_id, party_type);
CREATE INDEX idx_parties_trn         ON public.parties (trn) WHERE trn IS NOT NULL;

CREATE INDEX idx_items_entity        ON public.items (entity_id);
CREATE INDEX idx_items_type          ON public.items (entity_id, item_type);

CREATE INDEX idx_tax_codes_entity    ON public.tax_codes (entity_id);
CREATE INDEX idx_tax_codes_scope     ON public.tax_codes (entity_id, tax_scope);

CREATE INDEX idx_cc_dims_entity      ON public.cost_centre_dimensions (entity_id);
CREATE INDEX idx_cc_entity           ON public.cost_centres (entity_id);
CREATE INDEX idx_cc_dimension        ON public.cost_centres (dimension_id);
CREATE INDEX idx_cc_parent           ON public.cost_centres (parent_id) WHERE parent_id IS NOT NULL;

-- ============================================================================
-- 7. RLS HELPER FUNCTIONS
-- ============================================================================

-- Returns the current user's organisation_id from the JWT app_metadata.
CREATE OR REPLACE FUNCTION public.get_current_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'organisation_id')::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid
  );
$$;

-- Returns true if the current user has access to the given entity_id.
-- Reads the entity_ids array from JWT app_metadata.
CREATE OR REPLACE FUNCTION public.has_entity_access(p_entity_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.jwt() -> 'app_metadata' -> 'entity_ids' IS NULL THEN false
    WHEN jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'entity_ids') != 'array' THEN false
    ELSE p_entity_id = ANY(
      ARRAY(
        SELECT (jsonb_array_elements_text(auth.jwt() -> 'app_metadata' -> 'entity_ids'))::uuid
      )
    )
  END;
$$;

-- Returns true if the current user is a member of the given organisation
-- (fallback check via database when JWT claims are not yet available,
-- e.g. during onboarding).
CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organisation_users
    WHERE organisation_id = p_org_id
      AND user_id = auth.uid()
      AND is_active = true
  );
$$;

-- Returns true if the current user has access to the given entity
-- (fallback check via database).
CREATE OR REPLACE FUNCTION public.is_entity_member(p_entity_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.entity_users
    WHERE entity_id = p_entity_id
      AND user_id = auth.uid()
      AND is_active = true
  );
$$;

-- ============================================================================
-- 8. ENABLE RLS ON ALL TABLES
-- ============================================================================
ALTER TABLE public.organisations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisation_users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entities              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_years          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.periods               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currencies            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_codes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parties               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_centre_dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_centres          ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 9. RLS POLICIES
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 9.1 users — Own-row access only
-- ---------------------------------------------------------------------------
CREATE POLICY "users_select_own"
  ON public.users FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "users_insert_own"
  ON public.users FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "users_update_own"
  ON public.users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ---------------------------------------------------------------------------
-- 9.2 organisations — Members only (via JWT or DB fallback)
-- ---------------------------------------------------------------------------
CREATE POLICY "orgs_select"
  ON public.organisations FOR SELECT
  TO authenticated
  USING (
    id = public.get_current_org_id()
    OR public.is_org_member(id)
  );

CREATE POLICY "orgs_insert"
  ON public.organisations FOR INSERT
  TO authenticated
  WITH CHECK (true);  -- Any authenticated user can create an org (onboarding)

CREATE POLICY "orgs_update"
  ON public.organisations FOR UPDATE
  TO authenticated
  USING (
    id = public.get_current_org_id()
    OR public.is_org_member(id)
  )
  WITH CHECK (
    id = public.get_current_org_id()
    OR public.is_org_member(id)
  );

-- ---------------------------------------------------------------------------
-- 9.3 organisation_users — Org-scoped
-- ---------------------------------------------------------------------------
CREATE POLICY "org_users_select"
  ON public.organisation_users FOR SELECT
  TO authenticated
  USING (
    organisation_id = public.get_current_org_id()
    OR public.is_org_member(organisation_id)
  );

CREATE POLICY "org_users_insert"
  ON public.organisation_users FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Allow inserting your own membership (onboarding)
    user_id = auth.uid()
    OR organisation_id = public.get_current_org_id()
  );

CREATE POLICY "org_users_update"
  ON public.organisation_users FOR UPDATE
  TO authenticated
  USING (
    organisation_id = public.get_current_org_id()
    OR public.is_org_member(organisation_id)
  )
  WITH CHECK (
    organisation_id = public.get_current_org_id()
    OR public.is_org_member(organisation_id)
  );

CREATE POLICY "org_users_delete"
  ON public.organisation_users FOR DELETE
  TO authenticated
  USING (
    organisation_id = public.get_current_org_id()
    OR public.is_org_member(organisation_id)
  );

-- ---------------------------------------------------------------------------
-- 9.4 roles — Org-scoped
-- ---------------------------------------------------------------------------
CREATE POLICY "roles_select"
  ON public.roles FOR SELECT
  TO authenticated
  USING (
    organisation_id = public.get_current_org_id()
    OR public.is_org_member(organisation_id)
  );

CREATE POLICY "roles_insert"
  ON public.roles FOR INSERT
  TO authenticated
  WITH CHECK (
    organisation_id = public.get_current_org_id()
    OR public.is_org_member(organisation_id)
  );

CREATE POLICY "roles_update"
  ON public.roles FOR UPDATE
  TO authenticated
  USING (
    organisation_id = public.get_current_org_id()
    OR public.is_org_member(organisation_id)
  )
  WITH CHECK (
    organisation_id = public.get_current_org_id()
    OR public.is_org_member(organisation_id)
  );

CREATE POLICY "roles_delete"
  ON public.roles FOR DELETE
  TO authenticated
  USING (
    organisation_id = public.get_current_org_id()
    AND NOT is_system  -- Cannot delete system roles
  );

-- ---------------------------------------------------------------------------
-- 9.5 role_permissions — Via role's org
-- ---------------------------------------------------------------------------
CREATE POLICY "role_perms_select"
  ON public.role_permissions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = role_id
        AND (r.organisation_id = public.get_current_org_id()
             OR public.is_org_member(r.organisation_id))
    )
  );

CREATE POLICY "role_perms_insert"
  ON public.role_permissions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = role_id
        AND (r.organisation_id = public.get_current_org_id()
             OR public.is_org_member(r.organisation_id))
    )
  );

CREATE POLICY "role_perms_update"
  ON public.role_permissions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = role_id
        AND (r.organisation_id = public.get_current_org_id()
             OR public.is_org_member(r.organisation_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = role_id
        AND (r.organisation_id = public.get_current_org_id()
             OR public.is_org_member(r.organisation_id))
    )
  );

CREATE POLICY "role_perms_delete"
  ON public.role_permissions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = role_id
        AND r.organisation_id = public.get_current_org_id()
        AND NOT r.is_system  -- Cannot modify system role permissions
    )
  );

-- ---------------------------------------------------------------------------
-- 9.6 entities — Org-scoped (all entities within user's org)
-- ---------------------------------------------------------------------------
CREATE POLICY "entities_select"
  ON public.entities FOR SELECT
  TO authenticated
  USING (
    organisation_id = public.get_current_org_id()
    OR public.is_org_member(organisation_id)
  );

CREATE POLICY "entities_insert"
  ON public.entities FOR INSERT
  TO authenticated
  WITH CHECK (
    organisation_id = public.get_current_org_id()
    OR public.is_org_member(organisation_id)
  );

CREATE POLICY "entities_update"
  ON public.entities FOR UPDATE
  TO authenticated
  USING (
    organisation_id = public.get_current_org_id()
    OR public.is_org_member(organisation_id)
  )
  WITH CHECK (
    organisation_id = public.get_current_org_id()
    OR public.is_org_member(organisation_id)
  );

-- ---------------------------------------------------------------------------
-- 9.7 entity_users — Entity-scoped
-- ---------------------------------------------------------------------------
CREATE POLICY "entity_users_select"
  ON public.entity_users FOR SELECT
  TO authenticated
  USING (
    public.has_entity_access(entity_id)
    OR public.is_entity_member(entity_id)
  );

CREATE POLICY "entity_users_insert"
  ON public.entity_users FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Allow inserting your own entity membership during onboarding
    user_id = auth.uid()
    OR public.has_entity_access(entity_id)
  );

CREATE POLICY "entity_users_update"
  ON public.entity_users FOR UPDATE
  TO authenticated
  USING (
    public.has_entity_access(entity_id)
    OR public.is_entity_member(entity_id)
  )
  WITH CHECK (
    public.has_entity_access(entity_id)
    OR public.is_entity_member(entity_id)
  );

CREATE POLICY "entity_users_delete"
  ON public.entity_users FOR DELETE
  TO authenticated
  USING (
    public.has_entity_access(entity_id)
    OR public.is_entity_member(entity_id)
  );

-- ---------------------------------------------------------------------------
-- 9.8 Entity-scoped Masters: Generic pattern applied to each table
-- ---------------------------------------------------------------------------

-- Helper: Macro-like pattern for entity-scoped tables.
-- Each table gets SELECT, INSERT, UPDATE, DELETE with entity_id check.

-- fiscal_years
CREATE POLICY "fiscal_years_select" ON public.fiscal_years FOR SELECT TO authenticated
  USING (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));
CREATE POLICY "fiscal_years_insert" ON public.fiscal_years FOR INSERT TO authenticated
  WITH CHECK (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));
CREATE POLICY "fiscal_years_update" ON public.fiscal_years FOR UPDATE TO authenticated
  USING (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id))
  WITH CHECK (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));
CREATE POLICY "fiscal_years_delete" ON public.fiscal_years FOR DELETE TO authenticated
  USING (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));

-- periods
CREATE POLICY "periods_select" ON public.periods FOR SELECT TO authenticated
  USING (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));
CREATE POLICY "periods_insert" ON public.periods FOR INSERT TO authenticated
  WITH CHECK (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));
CREATE POLICY "periods_update" ON public.periods FOR UPDATE TO authenticated
  USING (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id))
  WITH CHECK (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));
CREATE POLICY "periods_delete" ON public.periods FOR DELETE TO authenticated
  USING (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));

-- accounts
CREATE POLICY "accounts_select" ON public.accounts FOR SELECT TO authenticated
  USING (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));
CREATE POLICY "accounts_insert" ON public.accounts FOR INSERT TO authenticated
  WITH CHECK (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));
CREATE POLICY "accounts_update" ON public.accounts FOR UPDATE TO authenticated
  USING (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id))
  WITH CHECK (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));
CREATE POLICY "accounts_delete" ON public.accounts FOR DELETE TO authenticated
  USING (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));

-- tax_codes
CREATE POLICY "tax_codes_select" ON public.tax_codes FOR SELECT TO authenticated
  USING (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));
CREATE POLICY "tax_codes_insert" ON public.tax_codes FOR INSERT TO authenticated
  WITH CHECK (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));
CREATE POLICY "tax_codes_update" ON public.tax_codes FOR UPDATE TO authenticated
  USING (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id))
  WITH CHECK (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));
CREATE POLICY "tax_codes_delete" ON public.tax_codes FOR DELETE TO authenticated
  USING (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));

-- parties
CREATE POLICY "parties_select" ON public.parties FOR SELECT TO authenticated
  USING (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));
CREATE POLICY "parties_insert" ON public.parties FOR INSERT TO authenticated
  WITH CHECK (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));
CREATE POLICY "parties_update" ON public.parties FOR UPDATE TO authenticated
  USING (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id))
  WITH CHECK (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));
CREATE POLICY "parties_delete" ON public.parties FOR DELETE TO authenticated
  USING (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));

-- items
CREATE POLICY "items_select" ON public.items FOR SELECT TO authenticated
  USING (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));
CREATE POLICY "items_insert" ON public.items FOR INSERT TO authenticated
  WITH CHECK (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));
CREATE POLICY "items_update" ON public.items FOR UPDATE TO authenticated
  USING (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id))
  WITH CHECK (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));
CREATE POLICY "items_delete" ON public.items FOR DELETE TO authenticated
  USING (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));

-- cost_centre_dimensions
CREATE POLICY "cc_dims_select" ON public.cost_centre_dimensions FOR SELECT TO authenticated
  USING (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));
CREATE POLICY "cc_dims_insert" ON public.cost_centre_dimensions FOR INSERT TO authenticated
  WITH CHECK (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));
CREATE POLICY "cc_dims_update" ON public.cost_centre_dimensions FOR UPDATE TO authenticated
  USING (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id))
  WITH CHECK (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));
CREATE POLICY "cc_dims_delete" ON public.cost_centre_dimensions FOR DELETE TO authenticated
  USING (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));

-- cost_centres
CREATE POLICY "cc_select" ON public.cost_centres FOR SELECT TO authenticated
  USING (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));
CREATE POLICY "cc_insert" ON public.cost_centres FOR INSERT TO authenticated
  WITH CHECK (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));
CREATE POLICY "cc_update" ON public.cost_centres FOR UPDATE TO authenticated
  USING (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id))
  WITH CHECK (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));
CREATE POLICY "cc_delete" ON public.cost_centres FOR DELETE TO authenticated
  USING (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));

-- ---------------------------------------------------------------------------
-- 9.9 currencies — Public read for authenticated users
-- ---------------------------------------------------------------------------
CREATE POLICY "currencies_select"
  ON public.currencies FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE for currencies — managed by migrations/admin only.

-- ============================================================================
-- END OF MIGRATION 00001
-- ============================================================================
