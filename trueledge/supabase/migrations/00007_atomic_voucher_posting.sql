-- ============================================================================
-- TrueLedge: Migration 00007 — Atomic Voucher Posting
-- ============================================================================
-- This migration creates:
--   1. resolve_period_for_date  — maps a voucher date to its open period
--   2. post_voucher_atomic      — posts a voucher in a single transaction
--
-- Why this exists
-- ---------------
-- The previous TypeScript `postVoucher` performed four sequential round trips
-- (generate number -> insert journal_entries -> insert journal_lines -> update
-- vouchers). A failure between any two left the ledger inconsistent: a journal
-- entry with no lines, or lines posted while the voucher still read 'draft'.
-- Because journal entries are immutable once posted (see 00003 section 9), that
-- state could not be repaired by an UPDATE — only by manual intervention.
--
-- Posting is the one operation in the system that must be all-or-nothing, so it
-- belongs in a single database transaction.
-- ============================================================================

-- ============================================================================
-- 1. PERIOD RESOLUTION
-- ============================================================================
-- Vouchers are created without a period; the period is a function of the
-- voucher date and must be resolved at posting time against the entity's
-- fiscal calendar.
--
-- Period 13 (year-end adjustments) is deliberately excluded: it shares its
-- date range with the final month, so including it would make resolution
-- ambiguous. Adjustment entries target it explicitly instead.

CREATE OR REPLACE FUNCTION public.resolve_period_for_date(
  p_entity_id UUID,
  p_date      DATE
)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT id
  FROM public.periods
  WHERE entity_id = p_entity_id
    AND period_number <= 12
    AND p_date BETWEEN start_date AND end_date
  ORDER BY period_number
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.resolve_period_for_date IS
  'Returns the monthly period (1-12) containing the given date for an entity, or NULL when the date falls outside every open fiscal year.';

-- ============================================================================
-- 2. ATOMIC POSTING
-- ============================================================================
-- Takes the caller-computed double-entry lines as JSONB and commits the whole
-- posting as one unit:
--
--   * resolves and validates the period (must exist and be open)
--   * verifies the voucher is in a postable state
--   * asserts debits equal credits in base currency BEFORE writing
--   * creates the journal entry, inserts the lines, marks the voucher posted
--
-- account_balances is maintained by the AFTER INSERT trigger from 00006, so it
-- updates as part of this same transaction with no extra work here.
--
-- Each element of p_lines:
--   { account_id, party_id, description, debit, credit,
--     base_debit, base_credit, cost_centre_id }

CREATE OR REPLACE FUNCTION public.post_voucher_atomic(
  p_voucher_id UUID,
  p_lines      JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id      UUID := auth.uid();
  v_voucher      public.vouchers;
  v_period_id    UUID;
  v_period_status public.period_status;
  v_entry_id     UUID;
  v_entry_number TEXT;
  v_total_debit  NUMERIC(19,4);
  v_total_credit NUMERIC(19,4);
  v_line_count   INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Lock the voucher for the duration of the transaction so two concurrent
  -- posts cannot both pass the status check and double-post the same document.
  SELECT * INTO v_voucher
  FROM public.vouchers
  WHERE id = p_voucher_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Voucher not found.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_voucher.status NOT IN ('draft', 'submitted') THEN
    RAISE EXCEPTION 'Cannot post a voucher with status ''%''.', v_voucher.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- ---- Lines present and balanced ----------------------------------------
  SELECT count(*),
         COALESCE(sum((l->>'base_debit')::numeric), 0),
         COALESCE(sum((l->>'base_credit')::numeric), 0)
  INTO v_line_count, v_total_debit, v_total_credit
  FROM jsonb_array_elements(p_lines) AS l;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'Voucher has no journal lines to post.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF round(v_total_debit, 4) <> round(v_total_credit, 4) THEN
    RAISE EXCEPTION
      'Entry is not balanced: debits % vs credits % (base currency).',
      round(v_total_debit, 4), round(v_total_credit, 4)
      USING ERRCODE = 'check_violation';
  END IF;

  -- ---- Period must exist and be open -------------------------------------
  v_period_id := COALESCE(
    v_voucher.period_id,
    public.resolve_period_for_date(v_voucher.entity_id, v_voucher.voucher_date)
  );

  IF v_period_id IS NULL THEN
    RAISE EXCEPTION
      'No accounting period covers %. Create the fiscal year for that date first.',
      v_voucher.voucher_date
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT status INTO v_period_status FROM public.periods WHERE id = v_period_id;

  IF v_period_status <> 'open' THEN
    RAISE EXCEPTION 'The period for % is % and cannot accept postings.',
      v_voucher.voucher_date, v_period_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- ---- Journal entry ------------------------------------------------------
  v_entry_number := public.generate_voucher_number(
    v_voucher.entity_id,
    'journal_voucher'::public.voucher_type
  );

  INSERT INTO public.journal_entries (
    entity_id, voucher_id, entry_number, entry_date, period_id,
    source, narration, currency_code, exchange_rate,
    status, created_by
  )
  VALUES (
    v_voucher.entity_id, v_voucher.id, v_entry_number, v_voucher.voucher_date, v_period_id,
    'voucher', COALESCE(v_voucher.narration, v_voucher.voucher_type || ' ' || v_voucher.voucher_number),
    v_voucher.currency_code, v_voucher.exchange_rate,
    'draft', v_user_id
  )
  RETURNING id INTO v_entry_id;

  -- ---- Journal lines ------------------------------------------------------
  INSERT INTO public.journal_lines (
    journal_entry_id, entity_id, line_number, account_id, party_id, description,
    debit_amount, credit_amount, base_debit, base_credit, cost_centre_id, created_by
  )
  SELECT
    v_entry_id,
    v_voucher.entity_id,
    (row_number() OVER ())::int,
    (l->>'account_id')::uuid,
    NULLIF(l->>'party_id', '')::uuid,
    NULLIF(l->>'description', ''),
    COALESCE((l->>'debit')::numeric, 0),
    COALESCE((l->>'credit')::numeric, 0),
    COALESCE((l->>'base_debit')::numeric, 0),
    COALESCE((l->>'base_credit')::numeric, 0),
    NULLIF(l->>'cost_centre_id', '')::uuid,
    v_user_id
  FROM jsonb_array_elements(p_lines) AS l;

  -- ---- Mark Journal Entry Posted ------------------------------------------
  UPDATE public.journal_entries
  SET status = 'posted',
      posted_at = now(),
      posted_by = v_user_id
  WHERE id = v_entry_id;

  -- ---- Flip the voucher ---------------------------------------------------
  UPDATE public.vouchers
  SET status    = 'posted',
      period_id = v_period_id,
      posted_at = now(),
      posted_by = v_user_id
  WHERE id = p_voucher_id;

  RETURN v_entry_id;
END;
$$;

COMMENT ON FUNCTION public.post_voucher_atomic IS
  'Posts a voucher in one transaction: validates status, balance and period, writes the journal entry and lines, and marks the voucher posted. account_balances is maintained by trigger.';

GRANT EXECUTE ON FUNCTION public.resolve_period_for_date TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_voucher_atomic     TO authenticated;
