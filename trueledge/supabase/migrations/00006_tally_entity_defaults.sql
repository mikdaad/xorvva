-- ============================================================================
-- TrueLedge: Multi-Tenant SaaS Accounting Platform
-- Migration 00006: Tally-Style Entity Defaults & Chart of Accounts
-- ============================================================================
-- This migration creates:
--   1. Extended entity columns (Tally "Company Creation" fields) + backfill
--   2. Account changes: name-identified ledgers, opening balances, tax details
--   3. account_balances — materialised per-period balances + maintenance trigger
--   4. prevent_account_delete — protects ledgers that carry posted journal lines
--   5. create_entity_with_defaults — single-transaction company creation RPC
--      that seeds the Tally group hierarchy and default ledgers
-- ============================================================================

-- ============================================================================
-- 1. ENTITIES — TALLY "COMPANY CREATION" FIELDS
-- ============================================================================
-- These previously lived in the entities.settings JSONB blob, which made them
-- unqueryable and untyped. Promote them to real columns and backfill.

ALTER TABLE public.entities
  ADD COLUMN IF NOT EXISTS mailing_name      TEXT,
  ADD COLUMN IF NOT EXISTS corporate_tax_trn VARCHAR(20),
  ADD COLUMN IF NOT EXISTS is_free_zone      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_zone_name    TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_year_start DATE,
  ADD COLUMN IF NOT EXISTS books_begin_date  DATE,
  ADD COLUMN IF NOT EXISTS decimal_places    SMALLINT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS coa_template      TEXT;

ALTER TABLE public.entities
  DROP CONSTRAINT IF EXISTS chk_entities_decimal_places;
ALTER TABLE public.entities
  ADD CONSTRAINT chk_entities_decimal_places
  CHECK (decimal_places IN (2, 4));

-- Backfill from the legacy settings JSONB written by createEntityInternal.
UPDATE public.entities SET
  corporate_tax_trn = COALESCE(corporate_tax_trn, NULLIF(settings->>'corporate_tax_trn', '')),
  is_free_zone      = COALESCE((settings->>'is_free_zone')::boolean, is_free_zone),
  free_zone_name    = COALESCE(free_zone_name, NULLIF(settings->>'free_zone_name', '')),
  coa_template      = COALESCE(coa_template, NULLIF(settings->>'coa_template', ''), 'trading'),
  mailing_name      = COALESCE(mailing_name, legal_name, trade_name)
WHERE settings IS NOT NULL;

-- Derive fiscal_year_start for existing entities from their earliest fiscal year.
UPDATE public.entities e SET
  fiscal_year_start = fy.start_date,
  books_begin_date  = COALESCE(e.books_begin_date, fy.start_date)
FROM (
  SELECT entity_id, MIN(start_date) AS start_date
  FROM public.fiscal_years
  GROUP BY entity_id
) fy
WHERE fy.entity_id = e.id
  AND e.fiscal_year_start IS NULL;

COMMENT ON COLUMN public.entities.mailing_name IS
  'Tally "Mailing Name" — the name printed on invoices and statements.';
COMMENT ON COLUMN public.entities.decimal_places IS
  'Currency decimal places for display. UAE AED uses 2; 4 supported for precision work.';

-- ============================================================================
-- 2. ACCOUNTS — TALLY LEDGER IDENTITY & MASTER DETAIL
-- ============================================================================
-- Tally identifies ledgers and groups by NAME, unique company-wide. Numeric
-- codes become optional metadata rather than the primary key of the chart.

ALTER TABLE public.accounts ALTER COLUMN code DROP NOT NULL;

ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS uq_account_entity_code;

-- Codes stay unique per entity when supplied, but may be NULL for Tally-style
-- name-only ledgers.
CREATE UNIQUE INDEX IF NOT EXISTS uq_account_entity_code
  ON public.accounts (entity_id, code)
  WHERE code IS NOT NULL;

-- Tally's real identity rule: a ledger/group name is unique within a company.
-- NOTE: this will fail loudly if an existing entity already holds duplicate
-- account names. That is deliberate — silently de-duplicating a chart of
-- accounts would be worse than a failed migration.
CREATE UNIQUE INDEX IF NOT EXISTS uq_account_entity_name
  ON public.accounts (entity_id, lower(name));

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS opening_balance      NUMERIC(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_balance_type CHAR(2),
  ADD COLUMN IF NOT EXISTS place_of_supply      TEXT,
  ADD COLUMN IF NOT EXISTS party_trn            VARCHAR(15),
  ADD COLUMN IF NOT EXISTS default_tax_code_id  UUID REFERENCES public.tax_codes(id) ON DELETE SET NULL;

ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS chk_accounts_ob_type;
ALTER TABLE public.accounts
  ADD CONSTRAINT chk_accounts_ob_type
  CHECK (opening_balance_type IS NULL OR opening_balance_type IN ('Dr', 'Cr'));

CREATE INDEX IF NOT EXISTS idx_accounts_default_tax
  ON public.accounts (default_tax_code_id) WHERE default_tax_code_id IS NOT NULL;

COMMENT ON COLUMN public.accounts.party_trn IS
  'Counter-party TRN captured on Sundry Debtor/Creditor ledgers for UAE tax invoices.';
COMMENT ON COLUMN public.accounts.opening_balance_type IS
  'Dr or Cr. Interpreted against opening_balance to seed the ledger.';

-- ============================================================================
-- 3. ACCOUNT_BALANCES — MATERIALISED PER-PERIOD BALANCES
-- ============================================================================
-- One row per (entity, account, period). Maintained incrementally by an
-- AFTER INSERT trigger on journal_lines. An insert-only trigger is sufficient
-- because posted journal lines are already immutable (see 00003, section 9).

CREATE TABLE IF NOT EXISTS public.account_balances (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id    UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  account_id   UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  period_id    UUID NOT NULL REFERENCES public.periods(id) ON DELETE CASCADE,

  debit_total  NUMERIC(19,4) NOT NULL DEFAULT 0,
  credit_total NUMERIC(19,4) NOT NULL DEFAULT 0,
  net_change   NUMERIC(19,4) GENERATED ALWAYS AS (debit_total - credit_total) STORED,

  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_account_balance UNIQUE (entity_id, account_id, period_id)
);

CREATE INDEX IF NOT EXISTS idx_acct_bal_entity  ON public.account_balances (entity_id);
CREATE INDEX IF NOT EXISTS idx_acct_bal_account ON public.account_balances (entity_id, account_id);
CREATE INDEX IF NOT EXISTS idx_acct_bal_period  ON public.account_balances (period_id);

COMMENT ON TABLE public.account_balances IS
  'Materialised per-period account balances in base currency. Maintained by trigger on journal_lines.';

-- ---------------------------------------------------------------------------
-- 3.1 Balance maintenance trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_journal_line_to_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_id UUID;
BEGIN
  -- The period lives on the parent journal entry.
  SELECT period_id INTO v_period_id
  FROM public.journal_entries
  WHERE id = NEW.journal_entry_id;

  IF v_period_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.account_balances (
    entity_id, account_id, period_id, debit_total, credit_total
  )
  VALUES (
    NEW.entity_id, NEW.account_id, v_period_id, NEW.base_debit, NEW.base_credit
  )
  ON CONFLICT (entity_id, account_id, period_id) DO UPDATE SET
    debit_total  = public.account_balances.debit_total  + EXCLUDED.debit_total,
    credit_total = public.account_balances.credit_total + EXCLUDED.credit_total,
    updated_at   = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_journal_line_to_balance ON public.journal_lines;
CREATE TRIGGER trg_apply_journal_line_to_balance
  AFTER INSERT ON public.journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.apply_journal_line_to_balance();

COMMENT ON FUNCTION public.apply_journal_line_to_balance() IS
  'Incrementally maintains account_balances as journal lines are inserted.';

-- ---------------------------------------------------------------------------
-- 3.2 RLS — mirrors journal_lines
-- ---------------------------------------------------------------------------
ALTER TABLE public.account_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "account_balances_select" ON public.account_balances;
CREATE POLICY "account_balances_select" ON public.account_balances FOR SELECT TO authenticated
  USING (public.has_entity_access(entity_id) OR public.is_entity_member(entity_id));

-- Writes happen only through the SECURITY DEFINER trigger above, so no
-- INSERT/UPDATE policy is granted to end users.

-- ============================================================================
-- 4. DELETE GUARD — NEVER HARD-DELETE A POSTED LEDGER
-- ============================================================================
-- Enforced in the database rather than only in the server action, so the rule
-- holds regardless of which code path attempts the delete.

CREATE OR REPLACE FUNCTION public.prevent_account_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line_count  BIGINT;
  v_child_count BIGINT;
BEGIN
  IF OLD.is_system THEN
    RAISE EXCEPTION
      'Ledger "%" is a system account and cannot be deleted. Deactivate it instead.', OLD.name
      USING ERRCODE = 'restrict_violation';
  END IF;

  SELECT count(*) INTO v_line_count
  FROM public.journal_lines WHERE account_id = OLD.id;

  IF v_line_count > 0 THEN
    RAISE EXCEPTION
      'Ledger "%" has % posted journal line(s) and cannot be deleted. Deactivate it instead.',
      OLD.name, v_line_count
      USING ERRCODE = 'restrict_violation';
  END IF;

  SELECT count(*) INTO v_child_count
  FROM public.accounts WHERE parent_id = OLD.id;

  IF v_child_count > 0 THEN
    RAISE EXCEPTION
      'Group "%" still has % child account(s). Reassign or delete them first.',
      OLD.name, v_child_count
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_account_delete ON public.accounts;
CREATE TRIGGER trg_prevent_account_delete
  BEFORE DELETE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_account_delete();

COMMENT ON FUNCTION public.prevent_account_delete() IS
  'Blocks hard-deletion of system accounts, accounts with posted journal lines, and non-empty groups.';

-- ============================================================================
-- 5. TAX CODES — DIRECTIONAL VAT ACCOUNT LINKS
-- ============================================================================
-- A single account_id cannot represent a tax code used on both sales and
-- purchases: standard-rated sales CREDIT output VAT, standard-rated purchases
-- DEBIT input VAT. Split the link by direction so voucher posting can resolve
-- the correct account instead of guessing.

ALTER TABLE public.tax_codes
  ADD COLUMN IF NOT EXISTS output_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS input_account_id  UUID REFERENCES public.accounts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tax_codes.output_account_id IS
  'VAT account credited on sales-side vouchers (output/payable VAT).';
COMMENT ON COLUMN public.tax_codes.input_account_id IS
  'VAT account debited on purchase-side vouchers (input/recoverable VAT).';

-- ============================================================================
-- 6. create_entity_with_defaults — TRANSACTIONAL COMPANY CREATION
-- ============================================================================
-- Tally's F3: Company Creation, as a single atomic operation. Replaces the
-- ~10 sequential client-side round-trips in createEntityInternal, where any
-- mid-way failure left an orphaned entity with a partial chart of accounts.
--
-- SECURITY INVOKER is deliberate: the caller's RLS policies still apply to
-- every insert, so this function cannot become a tenant-isolation bypass.
-- The entity_users grant is inserted early so that is_entity_member() returns
-- true for the remaining inserts within the same transaction.

CREATE OR REPLACE FUNCTION public.create_entity_with_defaults(
  p_organisation_id   UUID,
  p_trade_name        TEXT,
  p_mailing_name      TEXT                  DEFAULT NULL,
  p_legal_name        TEXT                  DEFAULT NULL,
  p_trn               VARCHAR(15)           DEFAULT NULL,
  p_corporate_tax_trn VARCHAR(20)           DEFAULT NULL,
  p_entity_type       public.entity_type    DEFAULT 'company',
  p_tax_treatment     public.tax_treatment  DEFAULT 'registered',
  p_address_line1     TEXT                  DEFAULT NULL,
  p_city              TEXT                  DEFAULT 'Dubai',
  p_emirate           TEXT                  DEFAULT 'Dubai',
  p_country           VARCHAR(2)            DEFAULT 'AE',
  p_phone             TEXT                  DEFAULT NULL,
  p_email             TEXT                  DEFAULT NULL,
  p_is_free_zone      BOOLEAN               DEFAULT false,
  p_free_zone_name    TEXT                  DEFAULT NULL,
  p_base_currency     VARCHAR(3)            DEFAULT 'AED',
  p_decimal_places    SMALLINT              DEFAULT 2,
  p_fiscal_year_start DATE                  DEFAULT NULL,
  p_books_begin_date  DATE                  DEFAULT NULL,
  p_coa_template      TEXT                  DEFAULT 'trading',
  p_extra_ledgers     JSONB                 DEFAULT '[]'::jsonb,
  p_role_id           UUID                  DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id     UUID := auth.uid();
  v_entity_id   UUID;
  v_fy_id       UUID;
  v_fy_start    DATE;
  v_fy_end      DATE;
  v_fy_name     TEXT;
  v_vat_output  UUID;
  v_vat_input   UUID;
BEGIN
  -- -------------------------------------------------------------------------
  -- Guards
  -- -------------------------------------------------------------------------
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.is_org_member(p_organisation_id) THEN
    RAISE EXCEPTION 'You do not have access to organisation %.', p_organisation_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF coalesce(btrim(p_trade_name), '') = '' THEN
    RAISE EXCEPTION 'Company name is required.' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.entities
    WHERE organisation_id = p_organisation_id AND trade_name = p_trade_name
  ) THEN
    RAISE EXCEPTION 'A company named "%" already exists in this organisation.', p_trade_name
      USING ERRCODE = 'unique_violation';
  END IF;

  v_fy_start := COALESCE(p_fiscal_year_start, date_trunc('year', CURRENT_DATE)::date);
  v_fy_end   := (v_fy_start + INTERVAL '1 year - 1 day')::date;
  v_fy_name  := CASE
    WHEN EXTRACT(YEAR FROM v_fy_start) = EXTRACT(YEAR FROM v_fy_end)
      THEN 'FY ' || EXTRACT(YEAR FROM v_fy_start)::TEXT
    ELSE 'FY ' || EXTRACT(YEAR FROM v_fy_start)::TEXT || '-' || EXTRACT(YEAR FROM v_fy_end)::TEXT
  END;

  -- -------------------------------------------------------------------------
  -- 1. Entity
  -- -------------------------------------------------------------------------
  INSERT INTO public.entities (
    organisation_id, trade_name, mailing_name, legal_name, trn, corporate_tax_trn,
    entity_type, tax_treatment, address_line1, city, emirate, country, phone, email,
    is_free_zone, free_zone_name, base_currency, decimal_places,
    fiscal_year_start, books_begin_date, coa_template, is_active, created_by
  )
  VALUES (
    p_organisation_id, p_trade_name,
    COALESCE(NULLIF(btrim(p_mailing_name), ''), p_legal_name, p_trade_name),
    p_legal_name, NULLIF(p_trn, ''), NULLIF(p_corporate_tax_trn, ''),
    p_entity_type, p_tax_treatment, p_address_line1, p_city, p_emirate, p_country,
    p_phone, NULLIF(p_email, ''),
    p_is_free_zone, p_free_zone_name, p_base_currency, p_decimal_places,
    v_fy_start, COALESCE(p_books_begin_date, v_fy_start), p_coa_template, true, v_user_id
  )
  RETURNING id INTO v_entity_id;

  -- -------------------------------------------------------------------------
  -- 2. Entity owner grant — inserted early so is_entity_member() succeeds for
  --    every subsequent insert inside this same transaction.
  -- -------------------------------------------------------------------------
  INSERT INTO public.entity_users (entity_id, user_id, role_id, is_active, created_by)
  VALUES (v_entity_id, v_user_id, p_role_id, true, v_user_id);

  -- -------------------------------------------------------------------------
  -- 3. Fiscal year
  -- -------------------------------------------------------------------------
  INSERT INTO public.fiscal_years (entity_id, name, start_date, end_date, is_closed, created_by)
  VALUES (v_entity_id, v_fy_name, v_fy_start, v_fy_end, false, v_user_id)
  RETURNING id INTO v_fy_id;

  -- -------------------------------------------------------------------------
  -- 4. Twelve monthly periods + period 13 for year-end adjustments
  -- -------------------------------------------------------------------------
  INSERT INTO public.periods (
    fiscal_year_id, entity_id, name, period_number, start_date, end_date, status, created_by
  )
  SELECT
    v_fy_id,
    v_entity_id,
    to_char((v_fy_start + (g.i || ' months')::interval)::date, 'FMMonth YYYY'),
    (g.i + 1)::smallint,
    (v_fy_start + (g.i || ' months')::interval)::date,
    (v_fy_start + (g.i || ' months')::interval + INTERVAL '1 month - 1 day')::date,
    'open',
    v_user_id
  FROM generate_series(0, 11) AS g(i);

  INSERT INTO public.periods (
    fiscal_year_id, entity_id, name, period_number, start_date, end_date, status, created_by
  )
  VALUES (
    v_fy_id, v_entity_id,
    'Year-End Adjustment ' || EXTRACT(YEAR FROM v_fy_end)::TEXT,
    13, v_fy_end, v_fy_end, 'open', v_user_id
  );

  -- -------------------------------------------------------------------------
  -- 5. Tally chart of accounts — groups, sub-groups and default ledgers
  -- -------------------------------------------------------------------------
  -- The whole chart lands in one statement. UUIDs are pre-generated in a
  -- MATERIALIZED CTE so parent links and levels can be resolved by name
  -- without a second pass.
  --
  -- Capital Account and Reserves & Surplus sit under Liabilities exactly as
  -- Tally presents them, but carry account_type 'equity' so the balance sheet
  -- classifies them correctly.
  --
  -- VAT Input is typed 'liability' rather than 'asset' even though it is
  -- recoverable: in Tally it belongs to Duties & Taxes and its debit balance
  -- nets against output VAT, which is precisely how the UAE VAT return
  -- computes net payable. Typing it as an asset would break group roll-ups.
  WITH RECURSIVE def(
    nm, nm_ar, parent_nm, atype, asub, is_grp, is_ctrl, is_sys
  ) AS (
    VALUES
      -- ---- Assets -------------------------------------------------------
      ('Assets',                'الأصول',                    NULL,                   'asset',    'current_asset',    true,  false, true),
      ('Current Assets',        'الأصول المتداولة',          'Assets',               'asset',    'current_asset',    true,  false, true),
      ('Bank Accounts',         'الحسابات المصرفية',         'Current Assets',       'asset',    'current_asset',    true,  false, true),
      ('Cash-in-hand',          'النقدية في الصندوق',        'Current Assets',       'asset',    'current_asset',    true,  false, true),
      ('Sundry Debtors',        'المدينون المتنوعون',        'Current Assets',       'asset',    'current_asset',    true,  true,  true),
      ('Stock-in-hand',         'المخزون',                   'Current Assets',       'asset',    'current_asset',    true,  false, true),
      ('Loans & Advances',      'القروض والسلف',             'Assets',               'asset',    'current_asset',    true,  false, true),
      ('Fixed Assets',          'الأصول الثابتة',            'Assets',               'asset',    'fixed_asset',      true,  false, true),
      -- ---- Liabilities --------------------------------------------------
      ('Liabilities',           'الالتزامات',                NULL,                   'liability','current_liability',true,  false, true),
      ('Current Liabilities',   'الالتزامات المتداولة',      'Liabilities',          'liability','current_liability',true,  false, true),
      ('Sundry Creditors',      'الدائنون المتنوعون',        'Current Liabilities',  'liability','current_liability',true,  true,  true),
      ('Duties & Taxes',        'الرسوم والضرائب',           'Current Liabilities',  'liability','current_liability',true,  false, true),
      ('Provisions',            'المخصصات',                  'Current Liabilities',  'liability','current_liability',true,  false, true),
      ('Capital Account',       'حساب رأس المال',            'Liabilities',          'equity',   'equity_capital',   true,  false, true),
      ('Reserves & Surplus',    'الاحتياطيات والأرباح',      'Liabilities',          'equity',   'retained_earnings',true,  false, true),
      -- ---- Income -------------------------------------------------------
      ('Income',                'الإيرادات',                 NULL,                   'revenue',  'operating_revenue',true,  false, true),
      ('Direct Incomes',        'الإيرادات المباشرة',        'Income',               'revenue',  'operating_revenue',true,  false, true),
      ('Sales Accounts',        'حسابات المبيعات',           'Direct Incomes',       'revenue',  'operating_revenue',true,  false, true),
      ('Indirect Incomes',      'الإيرادات غير المباشرة',    'Income',               'revenue',  'other_revenue',    true,  false, true),
      -- ---- Expenses -----------------------------------------------------
      ('Expenses',              'المصروفات',                 NULL,                   'expense',  'operating_expense',true,  false, true),
      ('Direct Expenses',       'المصروفات المباشرة',        'Expenses',             'expense',  'cost_of_sales',    true,  false, true),
      ('Purchase Accounts',     'حسابات المشتريات',          'Direct Expenses',      'expense',  'cost_of_sales',    true,  false, true),
      ('Indirect Expenses',     'المصروفات غير المباشرة',    'Expenses',             'expense',  'operating_expense',true,  false, true),
      -- ---- Default ledgers (postable) -----------------------------------
      ('Cash',                  'النقدية',                   'Cash-in-hand',         'asset',    'current_asset',    false, false, true),
      ('Accounts Receivable',   'الحسابات المدينة',          'Sundry Debtors',       'asset',    'current_asset',    false, true,  true),
      ('Accounts Payable',      'الحسابات الدائنة',          'Sundry Creditors',     'liability','current_liability',false, true,  true),
      ('VAT Suspense Account',  'حساب ضريبة القيمة المضافة المعلق', 'Duties & Taxes','liability','current_liability',false, false, true),
      ('VAT Output',            'ضريبة القيمة المضافة المستحقة',   'Duties & Taxes','liability','current_liability',false, false, true),
      ('VAT Input',             'ضريبة القيمة المضافة المستردة',   'Duties & Taxes','liability','current_liability',false, false, true),
      ('Profit & Loss Account', 'حساب الأرباح والخسائر',     'Reserves & Surplus',   'equity',   'retained_earnings',false, false, true)
  ),
  seeded AS MATERIALIZED (
    SELECT d.*, gen_random_uuid() AS id FROM def d
  ),
  lvl AS (
    SELECT s.id, s.nm, 1 AS level
    FROM seeded s WHERE s.parent_nm IS NULL
    UNION ALL
    SELECT c.id, c.nm, l.level + 1
    FROM seeded c JOIN lvl l ON lower(c.parent_nm) = lower(l.nm)
  )
  INSERT INTO public.accounts (
    id, entity_id, name, name_ar, account_type, account_sub_type,
    parent_id, level, is_group, is_control, is_bank, is_system,
    currency_code, is_active, created_by
  )
  SELECT
    s.id, v_entity_id, s.nm, s.nm_ar,
    s.atype::public.account_type, s.asub::public.account_sub_type,
    p.id, l.level::smallint, s.is_grp, s.is_ctrl, false, s.is_sys,
    p_base_currency, true, v_user_id
  FROM seeded s
  JOIN lvl l ON l.id = s.id
  LEFT JOIN seeded p ON lower(p.nm) = lower(s.parent_nm);

  -- -------------------------------------------------------------------------
  -- 6. Industry-template ledgers, parented onto the Tally groups by name.
  --    Collisions with a seeded name are skipped rather than fatal.
  -- -------------------------------------------------------------------------
  IF p_extra_ledgers IS NOT NULL AND jsonb_array_length(p_extra_ledgers) > 0 THEN
    INSERT INTO public.accounts (
      entity_id, name, name_ar, account_type, account_sub_type,
      parent_id, level, is_group, is_bank, is_system,
      currency_code, is_active, created_by
    )
    SELECT
      v_entity_id,
      e->>'name',
      NULLIF(e->>'name_ar', ''),
      (e->>'type')::public.account_type,
      (e->>'sub_type')::public.account_sub_type,
      p.id,
      (p.level + 1)::smallint,
      false,
      COALESCE((e->>'is_bank')::boolean, false),
      false,
      p_base_currency,
      true,
      v_user_id
    FROM jsonb_array_elements(p_extra_ledgers) AS e
    JOIN public.accounts p
      ON p.entity_id = v_entity_id
     AND lower(p.name) = lower(e->>'under')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT id INTO v_vat_output FROM public.accounts
    WHERE entity_id = v_entity_id AND name = 'VAT Output';
  SELECT id INTO v_vat_input FROM public.accounts
    WHERE entity_id = v_entity_id AND name = 'VAT Input';

  -- -------------------------------------------------------------------------
  -- 7. Default UAE VAT tax codes, linked to their directional VAT accounts
  --    so voucher posting resolves the right side without guessing.
  -- -------------------------------------------------------------------------
  INSERT INTO public.tax_codes (
    entity_id, code, name, rate, tax_scope, fta_code,
    account_id, output_account_id, input_account_id, is_default, created_by
  )
  VALUES
    (v_entity_id, 'SR',  'Standard Rated (5%)', 5.0, 'vat', 'SR',  v_vat_output, v_vat_output, v_vat_input, true,  v_user_id),
    (v_entity_id, 'ZR',  'Zero Rated (0%)',     0.0, 'vat', 'ZR',  NULL,         NULL,         NULL,        false, v_user_id),
    (v_entity_id, 'EX',  'Exempt',              0.0, 'vat', 'EX',  NULL,         NULL,         NULL,        false, v_user_id),
    (v_entity_id, 'OOS', 'Out of Scope',        0.0, 'vat', 'OOS', NULL,         NULL,         NULL,        false, v_user_id),
    (v_entity_id, 'RC',  'Reverse Charge (5%)', 5.0, 'vat', 'RC',  v_vat_output, v_vat_output, v_vat_input, false, v_user_id);

  RETURN v_entity_id;

END;
$$;

COMMENT ON FUNCTION public.create_entity_with_defaults IS
  'Tally F3: Company Creation as one transaction — entity, owner grant, fiscal year, 13 periods, Tally chart of accounts, default ledgers and UAE VAT codes. SECURITY INVOKER so caller RLS still applies.';

GRANT EXECUTE ON FUNCTION public.create_entity_with_defaults TO authenticated;


