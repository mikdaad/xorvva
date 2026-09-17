-- ============================================================================
-- TrueLedge: Multi-Tenant SaaS Accounting Platform
-- Migration 00003: Transaction Engine & Single Source of Truth
-- ============================================================================
-- This migration creates:
--   1. New enums for voucher/journal lifecycle
--   2. Transaction tables (vouchers, voucher_lines, journal_entries,
--      journal_lines, allocations, attachments)
--   3. Voucher number sequencing
--   4. Accounting invariant triggers:
--      a) Balanced journal entries (deferred constraint)
--      b) Immutability of posted entries
--      c) Period validation
--   5. Indexes for RLS and query performance
--   6. RLS policies on all new tables
-- ============================================================================

-- ============================================================================
-- 1. NEW ENUMS
-- ============================================================================

CREATE TYPE public.voucher_type AS ENUM (
  'sales_invoice',
  'purchase_bill',
  'credit_note',
  'debit_note',
  'receipt_voucher',
  'payment_voucher',
  'journal_voucher',
  'contra',
  'opening_balance'
);

CREATE TYPE public.voucher_status AS ENUM (
  'draft',
  'submitted',
  'posted',
  'reversed',
  'cancelled'
);

CREATE TYPE public.journal_source AS ENUM (
  'voucher',
  'reversal',
  'opening',
  'closing',
  'adjustment',
  'system'
);

-- ============================================================================
-- 2. VOUCHER NUMBER SEQUENCES
-- ============================================================================
-- Tracks the last used number per entity + voucher type combination.
-- Avoids relying on PostgreSQL sequences which are global, not per-entity.

CREATE TABLE public.voucher_sequences (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id     UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  voucher_type  public.voucher_type NOT NULL,
  prefix        TEXT NOT NULL,          -- e.g. 'SI', 'PB', 'CN', 'JV'
  last_number   BIGINT NOT NULL DEFAULT 0,
  fiscal_year   INT NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INT,

  UNIQUE (entity_id, voucher_type, fiscal_year)
);

-- Prefixes for each type
COMMENT ON TABLE public.voucher_sequences IS
  'Tracks per-entity, per-type, per-year voucher numbering.';

-- Function: Generate next voucher number atomically
CREATE OR REPLACE FUNCTION public.generate_voucher_number(
  p_entity_id   UUID,
  p_voucher_type public.voucher_type,
  p_fiscal_year  INT DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT;
  v_next   BIGINT;
  v_result TEXT;
BEGIN
  -- Map voucher type to prefix
  v_prefix := CASE p_voucher_type
    WHEN 'sales_invoice'    THEN 'SI'
    WHEN 'purchase_bill'    THEN 'PB'
    WHEN 'credit_note'      THEN 'CN'
    WHEN 'debit_note'       THEN 'DN'
    WHEN 'receipt_voucher'  THEN 'RV'
    WHEN 'payment_voucher'  THEN 'PV'
    WHEN 'journal_voucher'  THEN 'JV'
    WHEN 'contra'           THEN 'CT'
    WHEN 'opening_balance'  THEN 'OB'
    ELSE 'XX'
  END;

  -- Upsert the sequence row and increment atomically
  INSERT INTO public.voucher_sequences (entity_id, voucher_type, prefix, last_number, fiscal_year)
  VALUES (p_entity_id, p_voucher_type, v_prefix, 1, p_fiscal_year)
  ON CONFLICT (entity_id, voucher_type, fiscal_year)
  DO UPDATE SET last_number = public.voucher_sequences.last_number + 1
  RETURNING last_number INTO v_next;

  -- Format: PREFIX-YEAR-NNNNN (e.g. SI-2026-00001)
  v_result := v_prefix || '-' || p_fiscal_year::TEXT || '-' || LPAD(v_next::TEXT, 5, '0');

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 3. VOUCHERS (Source Documents)
-- ============================================================================
-- Every financial document (invoice, bill, receipt, payment, journal) starts
-- as a voucher. Vouchers hold business-facing detail.

CREATE TABLE public.vouchers (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id         UUID NOT NULL REFERENCES public.entities(id) ON DELETE RESTRICT,
  voucher_type      public.voucher_type NOT NULL,
  voucher_number    TEXT NOT NULL,
  status            public.voucher_status NOT NULL DEFAULT 'draft',

  -- Parties
  party_id          UUID REFERENCES public.parties(id) ON DELETE RESTRICT,

  -- Dates
  voucher_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date          DATE,
  supply_date       DATE,                   -- FTA: Tax point / date of supply

  -- Currency
  currency_code     TEXT NOT NULL DEFAULT 'AED',
  exchange_rate     NUMERIC(12,6) NOT NULL DEFAULT 1.000000,

  -- Totals (transaction currency)
  subtotal          NUMERIC(19,4) NOT NULL DEFAULT 0,
  discount_total    NUMERIC(19,4) NOT NULL DEFAULT 0,
  tax_total         NUMERIC(19,4) NOT NULL DEFAULT 0,
  total_amount      NUMERIC(19,4) NOT NULL DEFAULT 0,

  -- Totals (base currency — AED)
  base_subtotal     NUMERIC(19,4) NOT NULL DEFAULT 0,
  base_discount     NUMERIC(19,4) NOT NULL DEFAULT 0,
  base_tax_total    NUMERIC(19,4) NOT NULL DEFAULT 0,
  base_total_amount NUMERIC(19,4) NOT NULL DEFAULT 0,

  -- Amount tracking
  amount_paid       NUMERIC(19,4) NOT NULL DEFAULT 0,
  amount_due        NUMERIC(19,4) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,

  -- References
  reference         TEXT,                   -- External ref (supplier invoice no, etc.)
  narration         TEXT,                   -- Description / memo
  terms_and_conditions TEXT,
  internal_notes    TEXT,

  -- FTA e-invoicing fields
  place_of_supply   TEXT,                   -- Emirate of supply
  buyer_trn         TEXT,                   -- Buyer's TRN for tax invoice
  seller_trn        TEXT,                   -- Seller's TRN (auto-filled from entity)

  -- Posting
  period_id         UUID REFERENCES public.periods(id) ON DELETE RESTRICT,
  posted_at         TIMESTAMPTZ,
  posted_by         UUID REFERENCES auth.users(id),

  -- Reversal tracking
  reversed_by_id    UUID REFERENCES public.vouchers(id),  -- The reversal voucher
  reversal_of_id    UUID REFERENCES public.vouchers(id),  -- The original being reversed
  reversal_reason   TEXT,

  -- Audit
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES auth.users(id),
  updated_by        UUID REFERENCES auth.users(id),

  -- Constraints
  UNIQUE (entity_id, voucher_type, voucher_number),
  CHECK (exchange_rate > 0),
  CHECK (total_amount >= 0 OR voucher_type IN ('credit_note', 'debit_note'))
);

CREATE TRIGGER set_vouchers_updated_at
  BEFORE UPDATE ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.vouchers IS
  'Source documents: invoices, bills, receipts, payments, journal vouchers. Every financial event starts here.';

-- ============================================================================
-- 4. VOUCHER LINES (Commercial Detail)
-- ============================================================================
-- Line items on a voucher — items, quantities, rates, tax breakdowns.

CREATE TABLE public.voucher_lines (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  voucher_id        UUID NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
  entity_id         UUID NOT NULL REFERENCES public.entities(id) ON DELETE RESTRICT,
  line_number       INT NOT NULL,

  -- What
  item_id           UUID REFERENCES public.items(id) ON DELETE SET NULL,
  account_id        UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  description       TEXT,

  -- How much (transaction currency)
  quantity          NUMERIC(19,4) NOT NULL DEFAULT 1,
  unit_price        NUMERIC(19,4) NOT NULL DEFAULT 0,
  discount_pct      NUMERIC(5,2) NOT NULL DEFAULT 0,
  line_amount       NUMERIC(19,4) NOT NULL DEFAULT 0,  -- qty * price * (1 - disc%)

  -- Tax
  tax_code_id       UUID REFERENCES public.tax_codes(id) ON DELETE RESTRICT,
  tax_rate          NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(19,4) NOT NULL DEFAULT 0,
  line_total        NUMERIC(19,4) NOT NULL DEFAULT 0,  -- line_amount + tax_amount

  -- Base currency (AED) equivalents
  base_line_amount  NUMERIC(19,4) NOT NULL DEFAULT 0,
  base_tax_amount   NUMERIC(19,4) NOT NULL DEFAULT 0,
  base_line_total   NUMERIC(19,4) NOT NULL DEFAULT 0,

  -- Cost tracking
  cost_centre_id    UUID REFERENCES public.cost_centres(id) ON DELETE SET NULL,

  -- Sort / audit
  sort_order        INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES auth.users(id),
  updated_by        UUID REFERENCES auth.users(id),

  -- Constraints
  UNIQUE (voucher_id, line_number),
  CHECK (quantity > 0),
  CHECK (unit_price >= 0),
  CHECK (discount_pct >= 0 AND discount_pct <= 100),
  CHECK (tax_rate >= 0)
);

CREATE TRIGGER set_voucher_lines_updated_at
  BEFORE UPDATE ON public.voucher_lines
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.voucher_lines IS
  'Line items on a voucher. Commercial detail: items, quantities, rates, tax breakdowns.';

-- ============================================================================
-- 5. JOURNAL ENTRIES (The Immutable Ledger Header)
-- ============================================================================
-- The single source of truth. Every posted voucher generates a journal entry.
-- Once posted, entries are strictly immutable — correction is by reversal only.

CREATE TABLE public.journal_entries (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id         UUID NOT NULL REFERENCES public.entities(id) ON DELETE RESTRICT,
  voucher_id        UUID REFERENCES public.vouchers(id) ON DELETE RESTRICT,
  entry_number      TEXT NOT NULL,
  entry_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  period_id         UUID NOT NULL REFERENCES public.periods(id) ON DELETE RESTRICT,

  -- Classification
  source            public.journal_source NOT NULL DEFAULT 'voucher',
  narration         TEXT,

  -- Currency (mirrors voucher for consistency)
  currency_code     TEXT NOT NULL DEFAULT 'AED',
  exchange_rate     NUMERIC(12,6) NOT NULL DEFAULT 1.000000,

  -- Status
  status            public.voucher_status NOT NULL DEFAULT 'draft',
  posted_at         TIMESTAMPTZ,
  posted_by         UUID REFERENCES auth.users(id),

  -- Reversal tracking
  reversal_of_id    UUID REFERENCES public.journal_entries(id),
  reversed_by_id    UUID REFERENCES public.journal_entries(id),
  reversal_reason   TEXT,

  -- Audit
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES auth.users(id),
  updated_by        UUID REFERENCES auth.users(id),

  -- Constraints
  UNIQUE (entity_id, entry_number)
);

CREATE TRIGGER set_journal_entries_updated_at
  BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.journal_entries IS
  'The immutable general ledger. Every posted voucher produces journal lines. Once posted, entries cannot be modified — correction is by reversal and repost only.';

-- ============================================================================
-- 6. JOURNAL LINES (Double-Entry Posting Lines)
-- ============================================================================
-- The actual debit/credit postings. Dual-currency: transaction + base (AED).

CREATE TABLE public.journal_lines (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  journal_entry_id  UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  entity_id         UUID NOT NULL REFERENCES public.entities(id) ON DELETE RESTRICT,
  line_number       INT NOT NULL,

  -- Account
  account_id        UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  party_id          UUID REFERENCES public.parties(id) ON DELETE RESTRICT,
  description       TEXT,

  -- Amounts in transaction currency
  debit_amount      NUMERIC(19,4) NOT NULL DEFAULT 0,
  credit_amount     NUMERIC(19,4) NOT NULL DEFAULT 0,

  -- Amounts in base currency (AED)
  base_debit        NUMERIC(19,4) NOT NULL DEFAULT 0,
  base_credit       NUMERIC(19,4) NOT NULL DEFAULT 0,

  -- Cost tracking
  cost_centre_id    UUID REFERENCES public.cost_centres(id) ON DELETE SET NULL,

  -- Audit
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES auth.users(id),
  updated_by        UUID REFERENCES auth.users(id),

  -- Constraints
  UNIQUE (journal_entry_id, line_number),
  CHECK (debit_amount >= 0),
  CHECK (credit_amount >= 0),
  CHECK (base_debit >= 0),
  CHECK (base_credit >= 0),
  -- A line must be either debit or credit, not both
  CHECK (
    (debit_amount > 0 AND credit_amount = 0) OR
    (credit_amount > 0 AND debit_amount = 0) OR
    (debit_amount = 0 AND credit_amount = 0)
  )
);

CREATE TRIGGER set_journal_lines_updated_at
  BEFORE UPDATE ON public.journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.journal_lines IS
  'Double-entry posting lines. Each line is either a debit or a credit. Dual currency: transaction currency + AED base.';

-- ============================================================================
-- 7. ALLOCATIONS (Payment-to-Invoice Matching)
-- ============================================================================
-- Links payments/receipts to invoices/bills for AR/AP tracking.

CREATE TABLE public.allocations (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id             UUID NOT NULL REFERENCES public.entities(id) ON DELETE RESTRICT,
  payment_voucher_id    UUID NOT NULL REFERENCES public.vouchers(id) ON DELETE RESTRICT,
  invoice_voucher_id    UUID NOT NULL REFERENCES public.vouchers(id) ON DELETE RESTRICT,

  -- Amounts
  allocated_amount      NUMERIC(19,4) NOT NULL,
  base_allocated_amount NUMERIC(19,4) NOT NULL,

  -- Audit
  allocated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES auth.users(id),

  -- Constraints
  CHECK (allocated_amount > 0),
  CHECK (base_allocated_amount > 0),
  UNIQUE (payment_voucher_id, invoice_voucher_id)
);

COMMENT ON TABLE public.allocations IS
  'Payment-to-invoice matching for AR/AP tracking. Links receipt/payment vouchers to invoice/bill vouchers.';

-- ============================================================================
-- 8. ATTACHMENTS (File Uploads)
-- ============================================================================
-- Documents, receipts, supporting files linked to vouchers.

CREATE TABLE public.attachments (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id     UUID NOT NULL REFERENCES public.entities(id) ON DELETE RESTRICT,
  voucher_id    UUID NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,

  -- File metadata
  file_name     TEXT NOT NULL,
  file_url      TEXT NOT NULL,
  file_size     BIGINT,           -- bytes
  mime_type     TEXT,
  description   TEXT,

  -- Audit
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by   UUID REFERENCES auth.users(id)
);

COMMENT ON TABLE public.attachments IS
  'File attachments linked to vouchers: scanned invoices, receipts, contracts, etc.';

-- ============================================================================
-- 9. ACCOUNTING INVARIANT TRIGGERS
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 9a. BALANCED JOURNAL ENTRIES (Deferred Constraint Trigger)
-- ---------------------------------------------------------------------------
-- At transaction commit, asserts SUM(base_debit) = SUM(base_credit) for
-- every modified journal entry. Uses DEFERRABLE INITIALLY DEFERRED so lines
-- can be inserted one-by-one within a transaction and the balance is only
-- checked at COMMIT.

CREATE OR REPLACE FUNCTION public.check_journal_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance NUMERIC(19,4);
  v_line_count INT;
BEGIN
  -- Calculate balance for this journal entry
  SELECT
    COALESCE(SUM(base_debit), 0) - COALESCE(SUM(base_credit), 0),
    COUNT(*)
  INTO v_balance, v_line_count
  FROM public.journal_lines
  WHERE journal_entry_id = NEW.journal_entry_id;

  -- Must have at least 2 lines
  IF v_line_count < 2 THEN
    RAISE EXCEPTION
      'Journal entry % must have at least 2 lines, found %',
      NEW.journal_entry_id, v_line_count;
  END IF;

  -- Must balance to zero
  IF v_balance <> 0 THEN
    RAISE EXCEPTION
      'Journal entry % is not balanced. Debit - Credit = % (base currency)',
      NEW.journal_entry_id, v_balance;
  END IF;

  RETURN NULL; -- AFTER trigger returns are ignored
END;
$$;

CREATE CONSTRAINT TRIGGER trg_check_journal_balance
  AFTER INSERT OR UPDATE ON public.journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.check_journal_balance();

COMMENT ON FUNCTION public.check_journal_balance() IS
  'Deferred constraint trigger: ensures every journal entry sums to zero (base_debit = base_credit) at transaction commit.';

-- ---------------------------------------------------------------------------
-- 9b. JOURNAL ENTRY IMMUTABILITY
-- ---------------------------------------------------------------------------
-- Once a journal_entry.status = 'posted', block UPDATE and DELETE on both
-- the entry header and its lines. Correction is by reversal only.

CREATE OR REPLACE FUNCTION public.enforce_journal_entry_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'posted' THEN
      RAISE EXCEPTION
        'Cannot delete posted journal entry %. Correction must be done by reversal.',
        OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: Allow only status transition from 'posted' to 'reversed'
  IF TG_OP = 'UPDATE' AND OLD.status = 'posted' THEN
    IF NEW.status = 'reversed' THEN
      -- Only allow setting reversed_by_id and status change
      RETURN NEW;
    ELSE
      RAISE EXCEPTION
        'Cannot update posted journal entry %. Correction must be done by reversal.',
        OLD.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_journal_entry_immutability
  BEFORE UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_journal_entry_immutability();

-- Lines: check parent entry status before allowing modification
CREATE OR REPLACE FUNCTION public.enforce_journal_line_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_status public.voucher_status;
  v_entry_id UUID;
BEGIN
  -- Determine the journal_entry_id and look up status
  IF TG_OP = 'DELETE' THEN
    v_entry_id := OLD.journal_entry_id;
  ELSE
    v_entry_id := NEW.journal_entry_id;
  END IF;

  SELECT status INTO v_entry_status
  FROM public.journal_entries
  WHERE id = v_entry_id;

  IF v_entry_status = 'posted' THEN
    RAISE EXCEPTION
      'Cannot modify lines of posted journal entry %. Correction must be done by reversal.',
      v_entry_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_journal_line_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON public.journal_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_journal_line_immutability();

-- ---------------------------------------------------------------------------
-- 9c. VOUCHER IMMUTABILITY (Posted Vouchers)
-- ---------------------------------------------------------------------------
-- Block edits to posted vouchers (similar to journals but allows reversal).

CREATE OR REPLACE FUNCTION public.enforce_voucher_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('posted', 'reversed') THEN
      RAISE EXCEPTION
        'Cannot delete % voucher %. Only draft or cancelled vouchers can be deleted.',
        OLD.status, OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: Allow specific status transitions from posted
  IF TG_OP = 'UPDATE' AND OLD.status = 'posted' THEN
    -- Allow: posted → reversed (marking as reversed)
    -- Allow: amount_paid updates (for allocation tracking)
    IF NEW.status = 'reversed' THEN
      RETURN NEW;
    ELSIF NEW.status = OLD.status
      AND NEW.amount_paid IS DISTINCT FROM OLD.amount_paid THEN
      -- Allow amount_paid update only
      RETURN NEW;
    ELSE
      RAISE EXCEPTION
        'Cannot update posted voucher %. Use reversal to correct.',
        OLD.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_voucher_immutability
  BEFORE UPDATE OR DELETE ON public.vouchers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_voucher_immutability();

-- ---------------------------------------------------------------------------
-- 9d. PERIOD VALIDATION
-- ---------------------------------------------------------------------------
-- Journal entries can only be posted to open periods.

CREATE OR REPLACE FUNCTION public.validate_journal_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_status public.period_status;
BEGIN
  -- Only validate when status is being set to 'posted'
  IF NEW.status = 'posted' AND (OLD IS NULL OR OLD.status <> 'posted') THEN
    SELECT status INTO v_period_status
    FROM public.periods
    WHERE id = NEW.period_id;

    IF v_period_status IS NULL THEN
      RAISE EXCEPTION 'Period % not found.', NEW.period_id;
    END IF;

    IF v_period_status <> 'open' THEN
      RAISE EXCEPTION
        'Cannot post journal entry to period % (status: %). Period must be open.',
        NEW.period_id, v_period_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_journal_period
  BEFORE INSERT OR UPDATE ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_journal_period();

-- ============================================================================
-- 10. INDEXES
-- ============================================================================

-- Vouchers
CREATE INDEX idx_vouchers_entity_id ON public.vouchers(entity_id);
CREATE INDEX idx_vouchers_entity_type ON public.vouchers(entity_id, voucher_type);
CREATE INDEX idx_vouchers_entity_status ON public.vouchers(entity_id, status);
CREATE INDEX idx_vouchers_entity_date ON public.vouchers(entity_id, voucher_date DESC);
CREATE INDEX idx_vouchers_party_id ON public.vouchers(party_id) WHERE party_id IS NOT NULL;
CREATE INDEX idx_vouchers_period_id ON public.vouchers(period_id) WHERE period_id IS NOT NULL;
CREATE INDEX idx_vouchers_reversal_of ON public.vouchers(reversal_of_id) WHERE reversal_of_id IS NOT NULL;

-- Voucher Lines
CREATE INDEX idx_voucher_lines_voucher_id ON public.voucher_lines(voucher_id);
CREATE INDEX idx_voucher_lines_entity_id ON public.voucher_lines(entity_id);
CREATE INDEX idx_voucher_lines_account_id ON public.voucher_lines(account_id);
CREATE INDEX idx_voucher_lines_item_id ON public.voucher_lines(item_id) WHERE item_id IS NOT NULL;

-- Journal Entries
CREATE INDEX idx_journal_entries_entity_id ON public.journal_entries(entity_id);
CREATE INDEX idx_journal_entries_entity_date ON public.journal_entries(entity_id, entry_date DESC);
CREATE INDEX idx_journal_entries_entity_status ON public.journal_entries(entity_id, status);
CREATE INDEX idx_journal_entries_voucher_id ON public.journal_entries(voucher_id) WHERE voucher_id IS NOT NULL;
CREATE INDEX idx_journal_entries_period_id ON public.journal_entries(period_id);

-- Journal Lines
CREATE INDEX idx_journal_lines_entry_id ON public.journal_lines(journal_entry_id);
CREATE INDEX idx_journal_lines_entity_id ON public.journal_lines(entity_id);
CREATE INDEX idx_journal_lines_account_id ON public.journal_lines(account_id);
CREATE INDEX idx_journal_lines_party_id ON public.journal_lines(party_id) WHERE party_id IS NOT NULL;
-- Composite for trial balance queries
CREATE INDEX idx_journal_lines_account_entry ON public.journal_lines(account_id, journal_entry_id);

-- Allocations
CREATE INDEX idx_allocations_entity_id ON public.allocations(entity_id);
CREATE INDEX idx_allocations_payment ON public.allocations(payment_voucher_id);
CREATE INDEX idx_allocations_invoice ON public.allocations(invoice_voucher_id);

-- Attachments
CREATE INDEX idx_attachments_entity_id ON public.attachments(entity_id);
CREATE INDEX idx_attachments_voucher_id ON public.attachments(voucher_id);

-- Voucher Sequences
CREATE INDEX idx_voucher_sequences_entity ON public.voucher_sequences(entity_id);

-- ============================================================================
-- 11. ROW-LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE public.voucher_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Voucher Sequences: Entity-scoped
-- ---------------------------------------------------------------------------
CREATE POLICY "voucher_sequences_select"
  ON public.voucher_sequences FOR SELECT
  USING (public.has_entity_access(entity_id));

CREATE POLICY "voucher_sequences_insert"
  ON public.voucher_sequences FOR INSERT
  WITH CHECK (public.has_entity_access(entity_id));

CREATE POLICY "voucher_sequences_update"
  ON public.voucher_sequences FOR UPDATE
  USING (public.has_entity_access(entity_id))
  WITH CHECK (public.has_entity_access(entity_id));

-- ---------------------------------------------------------------------------
-- Vouchers: Entity-scoped
-- ---------------------------------------------------------------------------
CREATE POLICY "vouchers_select"
  ON public.vouchers FOR SELECT
  USING (public.has_entity_access(entity_id));

CREATE POLICY "vouchers_insert"
  ON public.vouchers FOR INSERT
  WITH CHECK (public.has_entity_access(entity_id));

CREATE POLICY "vouchers_update"
  ON public.vouchers FOR UPDATE
  USING (public.has_entity_access(entity_id))
  WITH CHECK (public.has_entity_access(entity_id));

CREATE POLICY "vouchers_delete"
  ON public.vouchers FOR DELETE
  USING (public.has_entity_access(entity_id));

-- ---------------------------------------------------------------------------
-- Voucher Lines: Entity-scoped
-- ---------------------------------------------------------------------------
CREATE POLICY "voucher_lines_select"
  ON public.voucher_lines FOR SELECT
  USING (public.has_entity_access(entity_id));

CREATE POLICY "voucher_lines_insert"
  ON public.voucher_lines FOR INSERT
  WITH CHECK (public.has_entity_access(entity_id));

CREATE POLICY "voucher_lines_update"
  ON public.voucher_lines FOR UPDATE
  USING (public.has_entity_access(entity_id))
  WITH CHECK (public.has_entity_access(entity_id));

CREATE POLICY "voucher_lines_delete"
  ON public.voucher_lines FOR DELETE
  USING (public.has_entity_access(entity_id));

-- ---------------------------------------------------------------------------
-- Journal Entries: Entity-scoped
-- ---------------------------------------------------------------------------
CREATE POLICY "journal_entries_select"
  ON public.journal_entries FOR SELECT
  USING (public.has_entity_access(entity_id));

CREATE POLICY "journal_entries_insert"
  ON public.journal_entries FOR INSERT
  WITH CHECK (public.has_entity_access(entity_id));

CREATE POLICY "journal_entries_update"
  ON public.journal_entries FOR UPDATE
  USING (public.has_entity_access(entity_id))
  WITH CHECK (public.has_entity_access(entity_id));

CREATE POLICY "journal_entries_delete"
  ON public.journal_entries FOR DELETE
  USING (public.has_entity_access(entity_id));

-- ---------------------------------------------------------------------------
-- Journal Lines: Entity-scoped
-- ---------------------------------------------------------------------------
CREATE POLICY "journal_lines_select"
  ON public.journal_lines FOR SELECT
  USING (public.has_entity_access(entity_id));

CREATE POLICY "journal_lines_insert"
  ON public.journal_lines FOR INSERT
  WITH CHECK (public.has_entity_access(entity_id));

CREATE POLICY "journal_lines_update"
  ON public.journal_lines FOR UPDATE
  USING (public.has_entity_access(entity_id))
  WITH CHECK (public.has_entity_access(entity_id));

CREATE POLICY "journal_lines_delete"
  ON public.journal_lines FOR DELETE
  USING (public.has_entity_access(entity_id));

-- ---------------------------------------------------------------------------
-- Allocations: Entity-scoped
-- ---------------------------------------------------------------------------
CREATE POLICY "allocations_select"
  ON public.allocations FOR SELECT
  USING (public.has_entity_access(entity_id));

CREATE POLICY "allocations_insert"
  ON public.allocations FOR INSERT
  WITH CHECK (public.has_entity_access(entity_id));

CREATE POLICY "allocations_delete"
  ON public.allocations FOR DELETE
  USING (public.has_entity_access(entity_id));

-- ---------------------------------------------------------------------------
-- Attachments: Entity-scoped
-- ---------------------------------------------------------------------------
CREATE POLICY "attachments_select"
  ON public.attachments FOR SELECT
  USING (public.has_entity_access(entity_id));

CREATE POLICY "attachments_insert"
  ON public.attachments FOR INSERT
  WITH CHECK (public.has_entity_access(entity_id));

CREATE POLICY "attachments_delete"
  ON public.attachments FOR DELETE
  USING (public.has_entity_access(entity_id));
