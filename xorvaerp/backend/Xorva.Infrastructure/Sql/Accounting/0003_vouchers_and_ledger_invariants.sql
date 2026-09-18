-- ============================================================================
-- Xorva Accounting — ported from TrueLedge 00003 (vouchers, voucher_lines,
-- voucher_sequences, invariant triggers) + 00007 (resolve_period_for_date,
-- post_voucher_atomic) + the reverseVoucher server action (voucher.ts).
-- Script 0003: voucher source documents, atomic posting, ledger invariants
-- ============================================================================
-- SINGLE-LEDGER DECISION: TrueLedge's journal_entries / journal_lines are NOT
-- re-created. Vouchers post into Xorva's existing "JournalEntries" / "JournalLines"
-- (the same tables invoices, bills, payroll and FX already post to), so every
-- report, approval and payroll feed keeps reading one ledger.
--
-- What is ported verbatim in spirit:
--   * vouchers / voucher_lines            → "Vouchers" / "VoucherLines"
--   * voucher_sequences + generate_voucher_number → "VoucherSequences" + accounting.generate_voucher_number
--   * resolve_period_for_date             → accounting.resolve_period_for_date (FiscalPeriods)
--   * post_voucher_atomic                 → accounting.post_voucher_atomic (writes JournalEntries/Lines)
--   * reverseVoucher (TS)                 → accounting.reverse_voucher (all-or-nothing, was 5 round trips)
--   * enforce_voucher_immutability        → same, on "Vouchers"
--   * enforce_journal_*_immutability      → NEW on Xorva's JournalEntries/JournalLines
--   * validate_journal_period             → NEW on Xorva's JournalEntries
--   * check_journal_balance (deferred)    → NEW on Xorva's JournalLines
-- Adaptations: entity_id → TenantId+CompanyId; auth.uid() → app.current_user_id();
-- PG enums → varchar+CHECK; numeric(19,4) → (18,2)/(18,6) to match the ledger.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. VoucherSequences + generate_voucher_number  (TrueLedge 00003 §2)
-- ----------------------------------------------------------------------------
-- Per-company, per-type, per-year numbering. Journal-voucher (JV) numbers are NOT
-- generated here: the ledger's JournalEntries.EntryNumber comes from
-- AccountingSettings.NextJournalNumber (Xorva's NumberSequence) so the JV sequence
-- stays single-sourced whether a journal is posted by C# or by this RPC.

CREATE TABLE IF NOT EXISTS "VoucherSequences" (
  "Id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "TenantId"     UUID NOT NULL,
  "CompanyId"    UUID NOT NULL REFERENCES "Companies"("Id") ON DELETE CASCADE,
  "VoucherType"  VARCHAR(20) NOT NULL,
  "Prefix"       VARCHAR(5)  NOT NULL,
  "LastNumber"   BIGINT NOT NULL DEFAULT 0,
  "FiscalYear"   INT NOT NULL,
  CONSTRAINT "UQ_VoucherSequences_Company_Type_Year" UNIQUE ("CompanyId", "VoucherType", "FiscalYear")
);
CREATE INDEX IF NOT EXISTS "IX_VoucherSequences_CompanyId" ON "VoucherSequences" ("CompanyId");

CREATE OR REPLACE FUNCTION accounting.voucher_prefix(p_voucher_type TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_voucher_type
    WHEN 'SalesInvoice'   THEN 'SI'
    WHEN 'PurchaseBill'   THEN 'PB'
    WHEN 'CreditNote'     THEN 'CN'
    WHEN 'DebitNote'      THEN 'DN'
    WHEN 'Receipt'        THEN 'RV'
    WHEN 'Payment'        THEN 'PV'
    WHEN 'Journal'        THEN 'JV'
    WHEN 'Contra'         THEN 'CT'
    WHEN 'OpeningBalance' THEN 'OB'
    ELSE 'XX'
  END;
$$;

CREATE OR REPLACE FUNCTION accounting.generate_voucher_number(
  p_company_id   UUID,
  p_voucher_type TEXT,
  p_fiscal_year  INT DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INT
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant UUID;
  v_next   BIGINT;
BEGIN
  SELECT "TenantId" INTO v_tenant FROM "Companies" WHERE "Id" = p_company_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Company % not found.', p_company_id USING ERRCODE = 'no_data_found';
  END IF;

  -- Upsert + increment atomically (row lock on conflict serialises concurrent callers).
  INSERT INTO "VoucherSequences" ("TenantId", "CompanyId", "VoucherType", "Prefix", "LastNumber", "FiscalYear")
  VALUES (v_tenant, p_company_id, p_voucher_type, accounting.voucher_prefix(p_voucher_type), 1, p_fiscal_year)
  ON CONFLICT ("CompanyId", "VoucherType", "FiscalYear")
  DO UPDATE SET "LastNumber" = "VoucherSequences"."LastNumber" + 1
  RETURNING "LastNumber" INTO v_next;

  -- Format: PREFIX-YEAR-NNNNN (e.g. PV-2026-00001) — identical to TrueLedge.
  RETURN accounting.voucher_prefix(p_voucher_type) || '-' || p_fiscal_year::text || '-' || lpad(v_next::text, 5, '0');
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Vouchers (source documents)  (TrueLedge 00003 §3)
-- ----------------------------------------------------------------------------
-- Voucher types reachable from the unified entry screen (Contra F4, Payment F5,
-- Receipt F6, Journal F7). Sales/Purchase from that screen are delegated to Xorva's
-- existing Invoices/Bills documents (they already have their own posting recipes);
-- the type list keeps the full TrueLedge set so a voucher row can also act as the
-- register entry for those (SourceInvoiceId / SourceBillId link).

CREATE TABLE IF NOT EXISTS "Vouchers" (
  "Id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "TenantId"         UUID NOT NULL,
  "CompanyId"        UUID NOT NULL REFERENCES "Companies"("Id") ON DELETE RESTRICT,
  "VoucherType"      VARCHAR(20) NOT NULL
                     CHECK ("VoucherType" IN ('SalesInvoice','PurchaseBill','CreditNote','DebitNote',
                                              'Receipt','Payment','Journal','Contra','OpeningBalance')),
  "VoucherNumber"    VARCHAR(30) NOT NULL,
  "Status"           VARCHAR(20) NOT NULL DEFAULT 'Draft'
                     CHECK ("Status" IN ('Draft','Submitted','Posted','Reversed','Cancelled')),

  -- Parties
  "ContactId"        UUID REFERENCES "Contacts"("Id") ON DELETE RESTRICT,

  -- Dates
  "VoucherDate"      DATE NOT NULL DEFAULT CURRENT_DATE,
  "DueDate"          DATE,
  "SupplyDate"       DATE,                          -- FTA: tax point / date of supply

  -- Currency
  "Currency"         VARCHAR(3) NOT NULL DEFAULT 'AED',
  "ExchangeRate"     NUMERIC(18,6) NOT NULL DEFAULT 1,

  -- Totals (transaction currency)
  "SubTotal"         NUMERIC(18,2) NOT NULL DEFAULT 0,
  "DiscountTotal"    NUMERIC(18,2) NOT NULL DEFAULT 0,
  "TaxTotal"         NUMERIC(18,2) NOT NULL DEFAULT 0,
  "TotalAmount"      NUMERIC(18,2) NOT NULL DEFAULT 0,

  -- Totals (base currency)
  "BaseSubTotal"     NUMERIC(18,2) NOT NULL DEFAULT 0,
  "BaseDiscount"     NUMERIC(18,2) NOT NULL DEFAULT 0,
  "BaseTaxTotal"     NUMERIC(18,2) NOT NULL DEFAULT 0,
  "BaseTotalAmount"  NUMERIC(18,2) NOT NULL DEFAULT 0,

  -- Amount tracking
  "AmountPaid"       NUMERIC(18,2) NOT NULL DEFAULT 0,
  "AmountDue"        NUMERIC(18,2) GENERATED ALWAYS AS ("TotalAmount" - "AmountPaid") STORED,

  -- References
  "Reference"        VARCHAR(100),                  -- external ref (cheque no, supplier inv no…)
  "Narration"        VARCHAR(500),
  "TermsAndConditions" TEXT,
  "InternalNotes"    TEXT,

  -- FTA e-invoicing fields
  "PlaceOfSupply"    VARCHAR(50),
  "BuyerTrn"         VARCHAR(30),
  "SellerTrn"        VARCHAR(30),

  -- Posting (single ledger)
  "FiscalPeriodId"   UUID REFERENCES "FiscalPeriods"("Id") ON DELETE RESTRICT,
  "JournalEntryId"   UUID REFERENCES "JournalEntries"("Id") ON DELETE RESTRICT,
  "PostedAt"         TIMESTAMPTZ,
  "PostedBy"         UUID REFERENCES "Users"("Id") ON DELETE SET NULL,

  -- Links to Xorva's native trade documents (when the unified screen created one)
  "SourceInvoiceId"  UUID REFERENCES "Invoices"("Id") ON DELETE SET NULL,
  "SourceBillId"     UUID REFERENCES "Bills"("Id") ON DELETE SET NULL,

  -- Reversal tracking
  "ReversedById"     UUID REFERENCES "Vouchers"("Id"),
  "ReversalOfId"     UUID REFERENCES "Vouchers"("Id"),
  "ReversalReason"   VARCHAR(500),

  -- Audit
  "CreatedAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "UpdatedAt"        TIMESTAMPTZ,
  "CreatedBy"        UUID REFERENCES "Users"("Id") ON DELETE SET NULL,
  "UpdatedBy"        UUID REFERENCES "Users"("Id") ON DELETE SET NULL,

  CONSTRAINT "UQ_Vouchers_Company_Type_Number" UNIQUE ("CompanyId", "VoucherType", "VoucherNumber"),
  CONSTRAINT "CK_Vouchers_ExchangeRate" CHECK ("ExchangeRate" > 0),
  CONSTRAINT "CK_Vouchers_Total" CHECK ("TotalAmount" >= 0 OR "VoucherType" IN ('CreditNote','DebitNote'))
);

CREATE INDEX IF NOT EXISTS "IX_Vouchers_CompanyId"           ON "Vouchers" ("CompanyId");
CREATE INDEX IF NOT EXISTS "IX_Vouchers_CompanyId_Type"      ON "Vouchers" ("CompanyId", "VoucherType");
CREATE INDEX IF NOT EXISTS "IX_Vouchers_CompanyId_Status"    ON "Vouchers" ("CompanyId", "Status");
CREATE INDEX IF NOT EXISTS "IX_Vouchers_CompanyId_Date"      ON "Vouchers" ("CompanyId", "VoucherDate" DESC);
CREATE INDEX IF NOT EXISTS "IX_Vouchers_ContactId"           ON "Vouchers" ("ContactId") WHERE "ContactId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "IX_Vouchers_JournalEntryId"      ON "Vouchers" ("JournalEntryId") WHERE "JournalEntryId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "IX_Vouchers_ReversalOfId"        ON "Vouchers" ("ReversalOfId") WHERE "ReversalOfId" IS NOT NULL;

COMMENT ON TABLE "Vouchers" IS
  'Source documents from the unified voucher entry (Contra/Payment/Receipt/Journal…). Every financial event starts here; posting writes the single ledger (JournalEntries).';

-- ----------------------------------------------------------------------------
-- 3. VoucherLines (commercial detail)  (TrueLedge 00003 §4)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "VoucherLines" (
  "Id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "TenantId"        UUID NOT NULL,
  "CompanyId"       UUID NOT NULL REFERENCES "Companies"("Id") ON DELETE RESTRICT,
  "VoucherId"       UUID NOT NULL REFERENCES "Vouchers"("Id") ON DELETE CASCADE,
  "LineNumber"      INT NOT NULL,

  -- What
  "ProductId"       UUID REFERENCES "Products"("Id") ON DELETE SET NULL,
  "AccountId"       UUID NOT NULL REFERENCES "Accounts"("Id") ON DELETE RESTRICT,
  "Description"     VARCHAR(500),

  -- Direction for journal / settlement modes: +amount = debit, -amount = credit
  -- (TrueLedge encoded direction in the sign of base_line_amount; kept explicit here)
  "DrCr"            CHAR(2) NOT NULL DEFAULT 'DR' CHECK ("DrCr" IN ('DR','CR')),

  -- How much (transaction currency)
  "Quantity"        NUMERIC(18,4) NOT NULL DEFAULT 1,
  "UnitPrice"       NUMERIC(18,4) NOT NULL DEFAULT 0,
  "DiscountPct"     NUMERIC(5,2)  NOT NULL DEFAULT 0,
  "LineAmount"      NUMERIC(18,2) NOT NULL DEFAULT 0,   -- qty * price * (1 - disc%)

  -- Tax
  "TaxRateId"       UUID REFERENCES "TaxRates"("Id") ON DELETE RESTRICT,
  "TaxRatePercent"  NUMERIC(5,2)  NOT NULL DEFAULT 0,
  "TaxAmount"       NUMERIC(18,2) NOT NULL DEFAULT 0,
  "LineTotal"       NUMERIC(18,2) NOT NULL DEFAULT 0,   -- LineAmount + TaxAmount

  -- Base currency equivalents
  "BaseLineAmount"  NUMERIC(18,2) NOT NULL DEFAULT 0,
  "BaseTaxAmount"   NUMERIC(18,2) NOT NULL DEFAULT 0,
  "BaseLineTotal"   NUMERIC(18,2) NOT NULL DEFAULT 0,

  -- Cost tracking
  "CostCentreId"    UUID REFERENCES "CostCentres"("Id") ON DELETE SET NULL,

  "SortOrder"       INT NOT NULL DEFAULT 0,
  "CreatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "UpdatedAt"       TIMESTAMPTZ,
  "CreatedBy"       UUID REFERENCES "Users"("Id") ON DELETE SET NULL,
  "UpdatedBy"       UUID REFERENCES "Users"("Id") ON DELETE SET NULL,

  CONSTRAINT "UQ_VoucherLines_Voucher_LineNumber" UNIQUE ("VoucherId", "LineNumber"),
  CONSTRAINT "CK_VoucherLines_Quantity"    CHECK ("Quantity" > 0),
  CONSTRAINT "CK_VoucherLines_UnitPrice"   CHECK ("UnitPrice" >= 0),
  CONSTRAINT "CK_VoucherLines_DiscountPct" CHECK ("DiscountPct" >= 0 AND "DiscountPct" <= 100),
  CONSTRAINT "CK_VoucherLines_TaxRate"     CHECK ("TaxRatePercent" >= 0)
);

CREATE INDEX IF NOT EXISTS "IX_VoucherLines_VoucherId"    ON "VoucherLines" ("VoucherId");
CREATE INDEX IF NOT EXISTS "IX_VoucherLines_CompanyId"    ON "VoucherLines" ("CompanyId");
CREATE INDEX IF NOT EXISTS "IX_VoucherLines_AccountId"    ON "VoucherLines" ("AccountId");
CREATE INDEX IF NOT EXISTS "IX_VoucherLines_ProductId"    ON "VoucherLines" ("ProductId") WHERE "ProductId" IS NOT NULL;

-- Ledger back-reference: which voucher produced this journal entry (fast register joins).
ALTER TABLE "JournalEntries" ADD COLUMN IF NOT EXISTS "VoucherId" UUID REFERENCES "Vouchers"("Id") ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS "IX_JournalEntries_VoucherId" ON "JournalEntries" ("VoucherId") WHERE "VoucherId" IS NOT NULL;

-- Reversal linkage on the ledger itself (TrueLedge journal_entries.reversed_by_id / reversal_of_id).
-- Xorva already records the original in SourceId for Reversal entries; ReversedById closes the loop.
ALTER TABLE "JournalEntries" ADD COLUMN IF NOT EXISTS "ReversedById" UUID REFERENCES "JournalEntries"("Id") ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 4. Ledger invariant triggers on Xorva's JournalEntries / JournalLines
--    (TrueLedge 00003 §9a–9d, retargeted to the single ledger)
-- ----------------------------------------------------------------------------
-- Xorva's C# JournalPoster already enforces these in code; TrueLedge's philosophy is
-- that invariants must hold regardless of the code path (RPC, migration, psql).
-- These are the DB-level backstop. They are written to be TRANSPARENT to the existing
-- EF write patterns (insert entry + lines, set Status = 'Voided', flip IsReconciled).

-- 4a. Balanced entries — deferred constraint trigger at COMMIT (Σdebit = Σcredit, ≥ 2 lines)
CREATE OR REPLACE FUNCTION accounting.check_journal_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry_id UUID := COALESCE(NEW."JournalEntryId", OLD."JournalEntryId");
  v_balance  NUMERIC(18,2);
  v_count    INT;
  v_exists   BOOLEAN;
BEGIN
  -- Entry may have been deleted in the same transaction (cascade) — nothing to check.
  SELECT EXISTS (SELECT 1 FROM "JournalEntries" WHERE "Id" = v_entry_id) INTO v_exists;
  IF NOT v_exists THEN RETURN NULL; END IF;

  SELECT COALESCE(sum("Debit"), 0) - COALESCE(sum("Credit"), 0), count(*)
    INTO v_balance, v_count
  FROM "JournalLines" WHERE "JournalEntryId" = v_entry_id;

  IF v_count < 2 THEN
    RAISE EXCEPTION 'Journal entry % must have at least 2 lines, found %.', v_entry_id, v_count
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_balance <> 0 THEN
    RAISE EXCEPTION 'Journal entry % is not balanced. Debit - Credit = %.', v_entry_id, v_balance
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_lines_balance ON "JournalLines";
CREATE CONSTRAINT TRIGGER trg_journal_lines_balance
  AFTER INSERT OR UPDATE OF "Debit", "Credit" OR DELETE ON "JournalLines"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION accounting.check_journal_balance();

-- 4b. Posted entries are immutable. Allowed changes on a Posted header:
--       Status Posted → Voided (Xorva's void flow) and setting ReversedById / UpdatedAt / UpdatedBy.
--     Everything else raises. DELETE of a Posted/Voided entry raises.
CREATE OR REPLACE FUNCTION accounting.enforce_journal_entry_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."Status" IN ('Posted', 'Voided') THEN
      RAISE EXCEPTION 'Cannot delete % journal entry %. Correction must be done by reversal.', OLD."Status", OLD."EntryNumber"
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."Status" IN ('Posted', 'Voided') THEN
    IF (OLD."Status" = 'Posted' AND NEW."Status" NOT IN ('Posted', 'Voided'))
       OR (OLD."Status" = 'Voided' AND NEW."Status" <> 'Voided')   -- voided is terminal
       OR NEW."Date"        IS DISTINCT FROM OLD."Date"
       OR NEW."EntryNumber" IS DISTINCT FROM OLD."EntryNumber"
       OR NEW."TotalDebit"  IS DISTINCT FROM OLD."TotalDebit"
       OR NEW."TotalCredit" IS DISTINCT FROM OLD."TotalCredit"
       OR NEW."CompanyId"   IS DISTINCT FROM OLD."CompanyId"
       OR NEW."TenantId"    IS DISTINCT FROM OLD."TenantId"
       OR NEW."SourceType"  IS DISTINCT FROM OLD."SourceType"
       OR NEW."SourceId"    IS DISTINCT FROM OLD."SourceId"
       OR NEW."Description" IS DISTINCT FROM OLD."Description"
       OR NEW."PostedAt"    IS DISTINCT FROM OLD."PostedAt"
       OR NEW."PostedBy"    IS DISTINCT FROM OLD."PostedBy"
       OR NEW."VoucherId"   IS DISTINCT FROM OLD."VoucherId"
    THEN
      RAISE EXCEPTION 'Cannot update posted journal entry %. Correction must be done by reversal.', OLD."EntryNumber"
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_entries_immutability ON "JournalEntries";
CREATE TRIGGER trg_journal_entries_immutability
  BEFORE UPDATE OR DELETE ON "JournalEntries"
  FOR EACH ROW EXECUTE FUNCTION accounting.enforce_journal_entry_immutability();

-- 4c. Lines of a posted entry are immutable, except the bank-reconciliation flag
--     (Xorva's SetLineReconciled) and audit columns.
CREATE OR REPLACE FUNCTION accounting.enforce_journal_line_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry_id UUID := COALESCE(NEW."JournalEntryId", OLD."JournalEntryId");
  v_status   TEXT;
BEGIN
  SELECT "Status" INTO v_status FROM "JournalEntries" WHERE "Id" = v_entry_id;

  IF v_status IN ('Posted', 'Voided') THEN
    IF TG_OP = 'DELETE' THEN
      -- Allow only as part of a cascading delete of a non-posted parent (parent gone).
      RAISE EXCEPTION 'Cannot delete lines of posted journal entry %.', v_entry_id
        USING ERRCODE = 'restrict_violation';
    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW."AccountId"    IS DISTINCT FROM OLD."AccountId"
         OR NEW."Debit"     IS DISTINCT FROM OLD."Debit"
         OR NEW."Credit"    IS DISTINCT FROM OLD."Credit"
         OR NEW."ContactId" IS DISTINCT FROM OLD."ContactId"
         OR NEW."TaxRateId" IS DISTINCT FROM OLD."TaxRateId"
         OR NEW."CostCentreId" IS DISTINCT FROM OLD."CostCentreId"
         OR NEW."JournalEntryId" IS DISTINCT FROM OLD."JournalEntryId"
         OR NEW."CompanyId" IS DISTINCT FROM OLD."CompanyId"
      THEN
        RAISE EXCEPTION 'Cannot modify lines of posted journal entry %. Correction must be done by reversal.', v_entry_id
          USING ERRCODE = 'restrict_violation';
      END IF;
    ELSIF TG_OP = 'INSERT' THEN
      -- EF's JournalPoster (and post_voucher_atomic) insert the header with Status =
      -- 'Posted' and its lines in the SAME transaction. Lines may join a posted header
      -- only while that header row was created by the current transaction (xmin match);
      -- adding lines to an entry posted earlier is a mutation of history → rejected.
      IF NOT EXISTS (SELECT 1 FROM "JournalEntries"
                     WHERE "Id" = v_entry_id AND xmin = pg_current_xact_id()::xid) THEN
        RAISE EXCEPTION 'Cannot add lines to posted journal entry %.', v_entry_id
          USING ERRCODE = 'restrict_violation';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_lines_immutability ON "JournalLines";
CREATE TRIGGER trg_journal_lines_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON "JournalLines"
  FOR EACH ROW EXECUTE FUNCTION accounting.enforce_journal_line_immutability();

-- 4d. Period validation — an entry becoming Posted must fall in an OPEN period, when
--     the company has periods covering that date (permissive before periods exist,
--     exactly like Xorva's PeriodGuard).
CREATE OR REPLACE FUNCTION accounting.resolve_period_for_date(p_company_id UUID, p_date DATE)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT "Id"
  FROM "FiscalPeriods"
  WHERE "CompanyId" = p_company_id
    AND p_date BETWEEN "StartDate"::date AND "EndDate"::date
  ORDER BY "StartDate"
  LIMIT 1;
$$;

COMMENT ON FUNCTION accounting.resolve_period_for_date IS
  'Returns the fiscal period containing the date for a company, or NULL when none covers it (ported from TrueLedge).';

-- Single place that decides whether a period accepts postings. Script 0005 replaces
-- it with soft/hard-close semantics; 0003 only knows Xorva's IsClosed flag.
CREATE OR REPLACE FUNCTION accounting.assert_period_open(p_period_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_period RECORD;
BEGIN
  IF p_period_id IS NULL THEN RETURN; END IF;     -- no period covers the date → permissive (PeriodGuard parity)
  SELECT "Name", "IsClosed" INTO v_period FROM "FiscalPeriods" WHERE "Id" = p_period_id;
  IF FOUND AND v_period."IsClosed" THEN
    RAISE EXCEPTION 'The accounting period ''%'' is closed — post into an open period.', v_period."Name"
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION accounting.validate_journal_period()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."Status" = 'Posted' AND (TG_OP = 'INSERT' OR OLD."Status" <> 'Posted') THEN
    PERFORM accounting.assert_period_open(accounting.resolve_period_for_date(NEW."CompanyId", NEW."Date"::date));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_entries_period ON "JournalEntries";
CREATE TRIGGER trg_journal_entries_period
  BEFORE INSERT OR UPDATE OF "Status" ON "JournalEntries"
  FOR EACH ROW EXECUTE FUNCTION accounting.validate_journal_period();

-- 4e. Voucher immutability (TrueLedge 00003 §9c) — posted vouchers change only via
--     reversal or AmountPaid (allocation tracking).
CREATE OR REPLACE FUNCTION accounting.enforce_voucher_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."Status" IN ('Posted', 'Reversed') THEN
      RAISE EXCEPTION 'Cannot delete % voucher %. Only draft or cancelled vouchers can be deleted.', OLD."Status", OLD."VoucherNumber"
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."Status" = 'Posted' THEN
    IF NEW."Status" = 'Reversed' THEN
      RETURN NEW;                                       -- posted → reversed
    ELSIF NEW."Status" = 'Posted'
      AND NEW."AmountPaid" IS DISTINCT FROM OLD."AmountPaid"
      -- IS NOT DISTINCT FROM: a plain row(...) = row(...) yields NULL when ContactId is NULL
      AND row(NEW."VoucherType", NEW."VoucherNumber", NEW."ContactId", NEW."VoucherDate", NEW."Currency",
              NEW."ExchangeRate", NEW."TotalAmount", NEW."BaseTotalAmount", NEW."JournalEntryId", NEW."Narration")
        IS NOT DISTINCT FROM
          row(OLD."VoucherType", OLD."VoucherNumber", OLD."ContactId", OLD."VoucherDate", OLD."Currency",
              OLD."ExchangeRate", OLD."TotalAmount", OLD."BaseTotalAmount", OLD."JournalEntryId", OLD."Narration") THEN
      RETURN NEW;                                       -- allocation tracking only
    ELSE
      RAISE EXCEPTION 'Cannot update posted voucher %. Use reversal to correct.', OLD."VoucherNumber"
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  IF OLD."Status" = 'Reversed' THEN
    RAISE EXCEPTION 'Voucher % is reversed and cannot be changed.', OLD."VoucherNumber"
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vouchers_immutability ON "Vouchers";
CREATE TRIGGER trg_vouchers_immutability
  BEFORE UPDATE OR DELETE ON "Vouchers"
  FOR EACH ROW EXECUTE FUNCTION accounting.enforce_voucher_immutability();

-- Voucher lines follow their header: no edits once posted.
CREATE OR REPLACE FUNCTION accounting.enforce_voucher_line_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT "Status" INTO v_status FROM "Vouchers" WHERE "Id" = COALESCE(NEW."VoucherId", OLD."VoucherId");
  IF v_status IN ('Posted', 'Reversed') THEN
    RAISE EXCEPTION 'Cannot modify lines of a % voucher.', v_status USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_voucher_lines_immutability ON "VoucherLines";
CREATE TRIGGER trg_voucher_lines_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON "VoucherLines"
  FOR EACH ROW EXECUTE FUNCTION accounting.enforce_voucher_line_immutability();

-- ----------------------------------------------------------------------------
-- 5. Account hard-delete guard (TrueLedge 00006 prevent_account_delete)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION accounting.prevent_account_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_lines    BIGINT;
  v_children BIGINT;
BEGIN
  IF OLD."IsSystemAccount" THEN
    RAISE EXCEPTION 'Ledger "%" is a system account and cannot be deleted. Deactivate it instead.', OLD."Name"
      USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT count(*) INTO v_lines FROM "JournalLines" WHERE "AccountId" = OLD."Id";
  IF v_lines > 0 THEN
    RAISE EXCEPTION 'Ledger "%" has % posted journal line(s) and cannot be deleted. Deactivate it instead.', OLD."Name", v_lines
      USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT count(*) INTO v_children FROM "Accounts" WHERE "ParentAccountId" = OLD."Id";
  IF v_children > 0 THEN
    RAISE EXCEPTION 'Group "%" still has % child account(s). Reassign or delete them first.', OLD."Name", v_children
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_accounts_prevent_delete ON "Accounts";
CREATE TRIGGER trg_accounts_prevent_delete
  BEFORE DELETE ON "Accounts"
  FOR EACH ROW EXECUTE FUNCTION accounting.prevent_account_delete();

-- ----------------------------------------------------------------------------
-- 6. accounting.next_journal_number — the ledger's JV sequence (single source)
-- ----------------------------------------------------------------------------
-- Mirrors Xorva.Modules.Accounting.Common.NumberSequence: "{JournalPrefix}-{year}-{n:D4}",
-- incrementing AccountingSettings.NextJournalNumber under a row lock.
CREATE OR REPLACE FUNCTION accounting.next_journal_number(p_company_id UUID, p_date DATE)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix TEXT;
  v_n      INT;
BEGIN
  UPDATE "AccountingSettings"
     SET "NextJournalNumber" = "NextJournalNumber" + 1,
         "UpdatedAt" = now()
   WHERE "CompanyId" = p_company_id
  RETURNING "JournalPrefix", "NextJournalNumber" - 1 INTO v_prefix, v_n;

  IF v_n IS NULL THEN
    RAISE EXCEPTION 'Accounting is not set up for this company — create the chart of accounts first.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN v_prefix || '-' || extract(year from p_date)::int || '-' || lpad(v_n::text, 4, '0');
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. post_voucher_atomic  (TrueLedge 00007 §2) → writes the single ledger
-- ----------------------------------------------------------------------------
-- Takes the caller-computed double-entry lines as JSONB and commits the whole
-- posting as one unit:
--   * locks the voucher (FOR UPDATE) so two concurrent posts cannot double-post
--   * verifies the voucher is Draft/Submitted
--   * asserts Σdebit = Σcredit in BASE currency BEFORE writing
--   * resolves the period; if one covers the date it must be open
--   * validates every account (exists, same company, active)
--   * creates the JournalEntry + JournalLines, updates Account.CurrentBalance
--     exactly as JournalPoster.cs does (natural-balance cache), flips the voucher
--
-- Each element of p_lines:
--   { account_id, contact_id, description, base_debit, base_credit, cost_centre_id, tax_rate_id }
-- Amounts are base currency (the ledger is always base) — matches JournalDraft.
-- p_source_type must be a Xorva.Core.Enums.JournalSourceType name ('Voucher' is added
-- to that enum by this port; 'Reversal' already exists).
CREATE OR REPLACE FUNCTION accounting.post_voucher_atomic(
  p_voucher_id UUID,
  p_lines       JSONB,
  p_source_type TEXT DEFAULT 'Voucher',
  p_source_id   UUID DEFAULT NULL          -- defaults to the voucher; a reversal passes the reversed entry
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id      UUID := app.current_user_id();
  v_voucher      "Vouchers"%ROWTYPE;
  v_period_id    UUID;
  v_entry_id     UUID := gen_random_uuid();
  v_entry_number TEXT;
  v_total_debit  NUMERIC(18,2);
  v_total_credit NUMERIC(18,2);
  v_line_count   INT;
  v_bad_accounts INT;
  v_line         JSONB;
  v_acc          RECORD;
  v_debit        NUMERIC(18,2);
  v_credit       NUMERIC(18,2);
BEGIN
  -- ---- Lock + status ------------------------------------------------------
  SELECT * INTO v_voucher FROM "Vouchers" WHERE "Id" = p_voucher_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Voucher not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_voucher."Status" NOT IN ('Draft', 'Submitted') THEN
    RAISE EXCEPTION 'Cannot post a voucher with status ''%''.', v_voucher."Status" USING ERRCODE = 'check_violation';
  END IF;

  -- ---- Lines present, each one-sided, balanced ------------------------------
  SELECT count(*),
         COALESCE(sum((l->>'base_debit')::numeric), 0),
         COALESCE(sum((l->>'base_credit')::numeric), 0)
    INTO v_line_count, v_total_debit, v_total_credit
  FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) AS l;

  IF v_line_count < 2 THEN
    RAISE EXCEPTION 'A journal needs at least two lines.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_lines) l
             WHERE COALESCE((l->>'base_debit')::numeric, 0) < 0
                OR COALESCE((l->>'base_credit')::numeric, 0) < 0
                OR (COALESCE((l->>'base_debit')::numeric, 0) > 0) = (COALESCE((l->>'base_credit')::numeric, 0) > 0)) THEN
    RAISE EXCEPTION 'Each line must be either a debit OR a credit, and amounts cannot be negative.' USING ERRCODE = 'check_violation';
  END IF;
  IF round(v_total_debit, 2) <> round(v_total_credit, 2) THEN
    RAISE EXCEPTION 'Entry is not balanced: debits % vs credits % (base currency).',
      round(v_total_debit, 2), round(v_total_credit, 2) USING ERRCODE = 'check_violation';
  END IF;
  IF v_total_debit = 0 THEN
    RAISE EXCEPTION 'A journal cannot be for a zero amount.' USING ERRCODE = 'check_violation';
  END IF;

  -- ---- Period (must be open when one exists) -------------------------------
  v_period_id := COALESCE(v_voucher."FiscalPeriodId",
                          accounting.resolve_period_for_date(v_voucher."CompanyId", v_voucher."VoucherDate"));
  PERFORM accounting.assert_period_open(v_period_id);

  -- ---- Accounts: exist, same company, active --------------------------------
  SELECT count(*) INTO v_bad_accounts
  FROM (SELECT DISTINCT (l->>'account_id')::uuid AS id FROM jsonb_array_elements(p_lines) l) ids
  LEFT JOIN "Accounts" a ON a."Id" = ids.id AND a."CompanyId" = v_voucher."CompanyId"
  WHERE a."Id" IS NULL;
  IF v_bad_accounts > 0 THEN
    RAISE EXCEPTION 'One or more accounts do not exist in this company''s chart of accounts.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_lines) l
             JOIN "Accounts" a ON a."Id" = (l->>'account_id')::uuid
             WHERE NOT a."IsActive") THEN
    RAISE EXCEPTION 'Cannot post to an inactive account.' USING ERRCODE = 'check_violation';
  END IF;

  -- ---- Journal entry header --------------------------------------------------
  v_entry_number := accounting.next_journal_number(v_voucher."CompanyId", v_voucher."VoucherDate");

  INSERT INTO "JournalEntries" (
    "Id", "TenantId", "CompanyId", "EntryNumber", "Date", "Description",
    "SourceType", "SourceId", "Status", "PostedAt", "PostedBy",
    "TotalDebit", "TotalCredit", "VoucherId", "CreatedAt", "CreatedBy"
  ) VALUES (
    v_entry_id, v_voucher."TenantId", v_voucher."CompanyId", v_entry_number,
    (v_voucher."VoucherDate"::timestamp AT TIME ZONE 'UTC'),
    COALESCE(v_voucher."Narration", v_voucher."VoucherType" || ' ' || v_voucher."VoucherNumber"),
    p_source_type, COALESCE(p_source_id, v_voucher."Id"), 'Posted', now(), v_user_id,
    round(v_total_debit, 2), round(v_total_credit, 2), v_voucher."Id", now(), v_user_id
  );

  -- ---- Lines + cached balances (same rule as JournalPoster.cs) -------------
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_debit  := round(COALESCE((v_line->>'base_debit')::numeric, 0), 2);
    v_credit := round(COALESCE((v_line->>'base_credit')::numeric, 0), 2);

    INSERT INTO "JournalLines" (
      "Id", "TenantId", "CompanyId", "JournalEntryId", "AccountId", "Debit", "Credit",
      "ContactId", "TaxRateId", "Description", "IsReconciled", "CostCentreId", "CreatedAt", "CreatedBy"
    ) VALUES (
      gen_random_uuid(), v_voucher."TenantId", v_voucher."CompanyId", v_entry_id,
      (v_line->>'account_id')::uuid, v_debit, v_credit,
      COALESCE(NULLIF(v_line->>'contact_id', '')::uuid, v_voucher."ContactId"),
      NULLIF(v_line->>'tax_rate_id', '')::uuid,
      NULLIF(v_line->>'description', ''),
      false,
      NULLIF(v_line->>'cost_centre_id', '')::uuid,
      now(), v_user_id
    );

    SELECT "NormalBalance" INTO v_acc FROM "Accounts" WHERE "Id" = (v_line->>'account_id')::uuid;
    UPDATE "Accounts"
       SET "CurrentBalance" = "CurrentBalance" +
             CASE WHEN v_acc."NormalBalance" = 'Debit' THEN (v_debit - v_credit) ELSE (v_credit - v_debit) END,
           "UpdatedAt" = now()
     WHERE "Id" = (v_line->>'account_id')::uuid;
  END LOOP;

  -- ---- Flip the voucher ----------------------------------------------------
  UPDATE "Vouchers"
     SET "Status" = 'Posted',
         "FiscalPeriodId" = v_period_id,
         "JournalEntryId" = v_entry_id,
         "PostedAt" = now(),
         "PostedBy" = v_user_id,
         "UpdatedAt" = now(),
         "UpdatedBy" = v_user_id
   WHERE "Id" = p_voucher_id;

  RETURN v_entry_id;
END;
$$;

COMMENT ON FUNCTION accounting.post_voucher_atomic IS
  'Posts a voucher in one transaction into the single ledger (JournalEntries/JournalLines): validates status, balance, period and accounts; writes the entry; updates cached balances; marks the voucher posted. Ported from TrueLedge.';

-- ----------------------------------------------------------------------------
-- 8. reverse_voucher  (TrueLedge voucher.ts reverseVoucher, made atomic)
-- ----------------------------------------------------------------------------
-- Posts a mirror-image journal (swap Dr/Cr) dated p_date (default: today), creates
-- the reversal voucher row, marks the original Reversed and the original journal
-- Voided, and links both directions. Never deletes anything.
CREATE OR REPLACE FUNCTION accounting.reverse_voucher(
  p_voucher_id UUID,
  p_reason     TEXT,
  p_date       DATE DEFAULT CURRENT_DATE
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id     UUID := app.current_user_id();
  v_orig        "Vouchers"%ROWTYPE;
  v_orig_entry  "JournalEntries"%ROWTYPE;
  v_rev_id      UUID := gen_random_uuid();
  v_rev_number  TEXT;
  v_lines       JSONB;
  v_entry_id    UUID;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reversal reason is required.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_orig FROM "Vouchers" WHERE "Id" = p_voucher_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Voucher not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_orig."Status" <> 'Posted' THEN
    RAISE EXCEPTION 'Only posted vouchers can be reversed (status is ''%'').', v_orig."Status" USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_orig_entry FROM "JournalEntries" WHERE "Id" = v_orig."JournalEntryId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No posted journal entry found for this voucher.' USING ERRCODE = 'no_data_found';
  END IF;

  -- Mirror lines: swap sides.
  SELECT jsonb_agg(jsonb_build_object(
           'account_id',     l."AccountId",
           'contact_id',     l."ContactId",
           'tax_rate_id',    l."TaxRateId",
           'cost_centre_id', l."CostCentreId",
           'description',    COALESCE(l."Description", ''),
           'base_debit',     l."Credit",
           'base_credit',    l."Debit"))
    INTO v_lines
  FROM "JournalLines" l WHERE l."JournalEntryId" = v_orig_entry."Id";

  -- Reversal voucher (same type; number from the type's sequence; negative-mirror totals).
  v_rev_number := accounting.generate_voucher_number(v_orig."CompanyId", v_orig."VoucherType", extract(year from p_date)::int);

  INSERT INTO "Vouchers" (
    "Id", "TenantId", "CompanyId", "VoucherType", "VoucherNumber", "Status", "ContactId",
    "VoucherDate", "Currency", "ExchangeRate",
    "SubTotal", "DiscountTotal", "TaxTotal", "TotalAmount",
    "BaseSubTotal", "BaseDiscount", "BaseTaxTotal", "BaseTotalAmount",
    "Reference", "Narration", "ReversalOfId", "ReversalReason", "CreatedAt", "CreatedBy"
  ) VALUES (
    v_rev_id, v_orig."TenantId", v_orig."CompanyId", v_orig."VoucherType", v_rev_number, 'Draft', v_orig."ContactId",
    p_date, v_orig."Currency", v_orig."ExchangeRate",
    v_orig."SubTotal", v_orig."DiscountTotal", v_orig."TaxTotal", v_orig."TotalAmount",
    v_orig."BaseSubTotal", v_orig."BaseDiscount", v_orig."BaseTaxTotal", v_orig."BaseTotalAmount",
    v_orig."VoucherNumber", 'Reversal of ' || v_orig."VoucherNumber" || ' — ' || btrim(p_reason),
    v_orig."Id", btrim(p_reason), now(), v_user_id
  );

  -- Copy the commercial lines so the reversal document is self-describing.
  INSERT INTO "VoucherLines" (
    "Id", "TenantId", "CompanyId", "VoucherId", "LineNumber", "ProductId", "AccountId", "Description", "DrCr",
    "Quantity", "UnitPrice", "DiscountPct", "LineAmount", "TaxRateId", "TaxRatePercent", "TaxAmount", "LineTotal",
    "BaseLineAmount", "BaseTaxAmount", "BaseLineTotal", "CostCentreId", "SortOrder", "CreatedAt", "CreatedBy"
  )
  SELECT gen_random_uuid(), "TenantId", "CompanyId", v_rev_id, "LineNumber", "ProductId", "AccountId", "Description",
         CASE "DrCr" WHEN 'DR' THEN 'CR' ELSE 'DR' END,
         "Quantity", "UnitPrice", "DiscountPct", "LineAmount", "TaxRateId", "TaxRatePercent", "TaxAmount", "LineTotal",
         "BaseLineAmount", "BaseTaxAmount", "BaseLineTotal", "CostCentreId", "SortOrder", now(), v_user_id
  FROM "VoucherLines" WHERE "VoucherId" = v_orig."Id";

  -- Post the mirror journal through the same atomic path.
  -- Xorva convention for Reversal entries: SourceId = the entry being reversed.
  v_entry_id := accounting.post_voucher_atomic(v_rev_id, v_lines, 'Reversal', v_orig_entry."Id");

  -- Close the loop.
  UPDATE "JournalEntries" SET "Status" = 'Voided', "ReversedById" = v_entry_id, "UpdatedAt" = now(), "UpdatedBy" = v_user_id
   WHERE "Id" = v_orig_entry."Id";
  UPDATE "Vouchers" SET "Status" = 'Reversed', "ReversedById" = v_rev_id, "ReversalReason" = btrim(p_reason),
                        "UpdatedAt" = now(), "UpdatedBy" = v_user_id
   WHERE "Id" = v_orig."Id";

  RETURN v_rev_id;
END;
$$;

COMMENT ON FUNCTION accounting.reverse_voucher IS
  'Reverses a posted voucher atomically: mirror journal + reversal voucher, original marked Reversed / its journal Voided. Ported from TrueLedge reverseVoucher (was 5 non-atomic round trips).';

-- ----------------------------------------------------------------------------
-- 9. Audit + RLS
-- ----------------------------------------------------------------------------
SELECT app.install_audit_trigger('"Vouchers"');
SELECT app.install_audit_trigger('"VoucherLines"');
SELECT app.install_company_rls('"Vouchers"');
SELECT app.install_company_rls('"VoucherLines"');
SELECT app.install_company_rls('"VoucherSequences"');
