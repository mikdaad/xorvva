-- ============================================================================
-- TrueLedge: Multi-Tenant SaaS Accounting Platform
-- Migration 00004: Banking Module
-- ============================================================================
-- Creates:
--   1. Enums for import/match lifecycle
--   2. Banking tables (bank_accounts, bank_statements, bank_lines, match_rules)
--   3. Indexes for RLS and query performance
--   4. RLS policies (entity-scoped)
-- ============================================================================

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

CREATE TYPE public.import_status AS ENUM (
  'pending',
  'parsing',
  'previewing',
  'importing',
  'completed',
  'failed'
);

CREATE TYPE public.match_status AS ENUM (
  'unmatched',
  'suggested',
  'matched',
  'excluded'
);

-- ============================================================================
-- 2. BANK ACCOUNTS
-- ============================================================================
-- Each bank account is linked to a GL account (asset) for reconciliation.

CREATE TABLE public.bank_accounts (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id       UUID NOT NULL REFERENCES public.entities(id) ON DELETE RESTRICT,
  account_id      UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,

  -- Bank details
  bank_name       TEXT NOT NULL,
  account_number  TEXT NOT NULL,
  iban            TEXT,
  swift_code      TEXT,
  branch          TEXT,
  currency_code   TEXT NOT NULL DEFAULT 'AED',

  -- Balances
  opening_balance NUMERIC(19,4) NOT NULL DEFAULT 0,
  current_balance NUMERIC(19,4) NOT NULL DEFAULT 0,

  -- Status
  is_active       BOOLEAN NOT NULL DEFAULT true,

  -- Audit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id),
  updated_by      UUID REFERENCES auth.users(id),

  UNIQUE (entity_id, account_number),
  CHECK (opening_balance IS NOT NULL)
);

CREATE TRIGGER set_bank_accounts_updated_at
  BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.bank_accounts IS
  'Bank accounts linked to GL asset accounts. Each represents a real-world bank account for statement import and reconciliation.';

-- ============================================================================
-- 3. BANK STATEMENTS
-- ============================================================================
-- Imported statement headers — one per CSV upload or API fetch.

CREATE TABLE public.bank_statements (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id       UUID NOT NULL REFERENCES public.entities(id) ON DELETE RESTRICT,
  bank_account_id UUID NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,

  -- Statement details
  statement_date  DATE,
  period_from     DATE NOT NULL,
  period_to       DATE NOT NULL,

  -- Balances
  opening_balance NUMERIC(19,4),
  closing_balance NUMERIC(19,4),
  total_debits    NUMERIC(19,4) NOT NULL DEFAULT 0,
  total_credits   NUMERIC(19,4) NOT NULL DEFAULT 0,
  line_count      INT NOT NULL DEFAULT 0,

  -- Import source
  source_file     TEXT,                     -- Original filename
  source_format   TEXT,                     -- Detected bank format (e.g. 'enbd', 'adcb')
  import_status   public.import_status NOT NULL DEFAULT 'pending',
  import_errors   JSONB,                    -- Any parsing errors

  -- Audit
  imported_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  imported_by     UUID REFERENCES auth.users(id),

  CHECK (period_from <= period_to)
);

COMMENT ON TABLE public.bank_statements IS
  'Imported bank statement headers. One per CSV upload. Tracks import status, source file, and statement period.';

-- ============================================================================
-- 4. BANK LINES
-- ============================================================================
-- Individual bank transactions parsed from a statement.

CREATE TABLE public.bank_lines (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  statement_id      UUID NOT NULL REFERENCES public.bank_statements(id) ON DELETE CASCADE,
  entity_id         UUID NOT NULL REFERENCES public.entities(id) ON DELETE RESTRICT,
  bank_account_id   UUID NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,

  -- Transaction data
  line_date         DATE NOT NULL,
  value_date        DATE,
  description       TEXT NOT NULL,
  reference         TEXT,
  cheque_number     TEXT,

  -- Amounts
  debit             NUMERIC(19,4) NOT NULL DEFAULT 0,
  credit            NUMERIC(19,4) NOT NULL DEFAULT 0,
  balance           NUMERIC(19,4),          -- Running balance if available

  -- Raw data (preserve original CSV row for audit)
  raw_data          JSONB,
  line_number       INT NOT NULL DEFAULT 0,

  -- Matching
  match_status      public.match_status NOT NULL DEFAULT 'unmatched',
  matched_voucher_id UUID REFERENCES public.vouchers(id) ON DELETE SET NULL,
  matched_at        TIMESTAMPTZ,
  matched_by        UUID REFERENCES auth.users(id),
  match_rule_id     UUID,                   -- Which rule matched (set after match_rules table created)

  -- Audit
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (debit >= 0),
  CHECK (credit >= 0),
  -- A line must be either debit or credit
  CHECK (debit = 0 OR credit = 0)
);

COMMENT ON TABLE public.bank_lines IS
  'Individual bank transactions from imported statements. Preserves raw CSV data in raw_data JSONB for audit trail. Links to vouchers when matched.';

-- ============================================================================
-- 5. MATCH RULES
-- ============================================================================
-- Auto-matching rules: regex patterns → target account + party.
-- Used during reconciliation to auto-suggest matches.

CREATE TABLE public.match_rules (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id         UUID NOT NULL REFERENCES public.entities(id) ON DELETE RESTRICT,

  -- Rule definition
  rule_name         TEXT NOT NULL,
  description       TEXT,
  pattern           TEXT NOT NULL,           -- Regex pattern to match against bank line description
  pattern_field     TEXT NOT NULL DEFAULT 'description',  -- Which field to match against

  -- Targets
  target_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  target_party_id   UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  target_voucher_type public.voucher_type,

  -- Priority (lower = higher priority, checked first)
  priority          INT NOT NULL DEFAULT 100,
  is_active         BOOLEAN NOT NULL DEFAULT true,

  -- Stats
  times_used        INT NOT NULL DEFAULT 0,
  last_used_at      TIMESTAMPTZ,

  -- Audit
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES auth.users(id),
  updated_by        UUID REFERENCES auth.users(id),

  UNIQUE (entity_id, rule_name)
);

CREATE TRIGGER set_match_rules_updated_at
  BEFORE UPDATE ON public.match_rules
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.match_rules IS
  'Auto-matching rules for bank reconciliation. Regex patterns matched against bank line descriptions to suggest GL accounts and parties.';

-- Now add FK from bank_lines to match_rules
ALTER TABLE public.bank_lines
  ADD CONSTRAINT fk_bank_lines_match_rule
  FOREIGN KEY (match_rule_id) REFERENCES public.match_rules(id) ON DELETE SET NULL;

-- ============================================================================
-- 6. INDEXES
-- ============================================================================

-- Bank Accounts
CREATE INDEX idx_bank_accounts_entity ON public.bank_accounts(entity_id);
CREATE INDEX idx_bank_accounts_gl ON public.bank_accounts(account_id);

-- Bank Statements
CREATE INDEX idx_bank_statements_entity ON public.bank_statements(entity_id);
CREATE INDEX idx_bank_statements_account ON public.bank_statements(bank_account_id);
CREATE INDEX idx_bank_statements_period ON public.bank_statements(period_from, period_to);
CREATE INDEX idx_bank_statements_status ON public.bank_statements(import_status);

-- Bank Lines
CREATE INDEX idx_bank_lines_statement ON public.bank_lines(statement_id);
CREATE INDEX idx_bank_lines_entity ON public.bank_lines(entity_id);
CREATE INDEX idx_bank_lines_account ON public.bank_lines(bank_account_id);
CREATE INDEX idx_bank_lines_date ON public.bank_lines(line_date DESC);
CREATE INDEX idx_bank_lines_match_status ON public.bank_lines(match_status);
CREATE INDEX idx_bank_lines_matched_voucher ON public.bank_lines(matched_voucher_id) WHERE matched_voucher_id IS NOT NULL;

-- Match Rules
CREATE INDEX idx_match_rules_entity ON public.match_rules(entity_id);
CREATE INDEX idx_match_rules_priority ON public.match_rules(entity_id, priority);
CREATE INDEX idx_match_rules_active ON public.match_rules(entity_id, is_active) WHERE is_active = true;

-- ============================================================================
-- 7. ROW-LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_rules ENABLE ROW LEVEL SECURITY;

-- Bank Accounts
CREATE POLICY "bank_accounts_select" ON public.bank_accounts FOR SELECT
  USING (public.has_entity_access(entity_id));
CREATE POLICY "bank_accounts_insert" ON public.bank_accounts FOR INSERT
  WITH CHECK (public.has_entity_access(entity_id));
CREATE POLICY "bank_accounts_update" ON public.bank_accounts FOR UPDATE
  USING (public.has_entity_access(entity_id))
  WITH CHECK (public.has_entity_access(entity_id));
CREATE POLICY "bank_accounts_delete" ON public.bank_accounts FOR DELETE
  USING (public.has_entity_access(entity_id));

-- Bank Statements
CREATE POLICY "bank_statements_select" ON public.bank_statements FOR SELECT
  USING (public.has_entity_access(entity_id));
CREATE POLICY "bank_statements_insert" ON public.bank_statements FOR INSERT
  WITH CHECK (public.has_entity_access(entity_id));
CREATE POLICY "bank_statements_update" ON public.bank_statements FOR UPDATE
  USING (public.has_entity_access(entity_id))
  WITH CHECK (public.has_entity_access(entity_id));
CREATE POLICY "bank_statements_delete" ON public.bank_statements FOR DELETE
  USING (public.has_entity_access(entity_id));

-- Bank Lines
CREATE POLICY "bank_lines_select" ON public.bank_lines FOR SELECT
  USING (public.has_entity_access(entity_id));
CREATE POLICY "bank_lines_insert" ON public.bank_lines FOR INSERT
  WITH CHECK (public.has_entity_access(entity_id));
CREATE POLICY "bank_lines_update" ON public.bank_lines FOR UPDATE
  USING (public.has_entity_access(entity_id))
  WITH CHECK (public.has_entity_access(entity_id));
CREATE POLICY "bank_lines_delete" ON public.bank_lines FOR DELETE
  USING (public.has_entity_access(entity_id));

-- Match Rules
CREATE POLICY "match_rules_select" ON public.match_rules FOR SELECT
  USING (public.has_entity_access(entity_id));
CREATE POLICY "match_rules_insert" ON public.match_rules FOR INSERT
  WITH CHECK (public.has_entity_access(entity_id));
CREATE POLICY "match_rules_update" ON public.match_rules FOR UPDATE
  USING (public.has_entity_access(entity_id))
  WITH CHECK (public.has_entity_access(entity_id));
CREATE POLICY "match_rules_delete" ON public.match_rules FOR DELETE
  USING (public.has_entity_access(entity_id));
