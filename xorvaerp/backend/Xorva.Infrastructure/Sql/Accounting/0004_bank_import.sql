-- ============================================================================
-- Xorva Accounting — ported from TrueLedge 00004 (bank_statements, bank_lines,
-- match_rules) + banking.ts importBankStatement (made atomic).
-- Script 0004: bank statement import + rule-based matching → single-ledger reconciliation
-- ============================================================================
-- Xorva already has "BankAccounts" (linked to a GL account) and a per-line
-- JournalLines."IsReconciled" flag with a manual reconciliation screen. TrueLedge adds
-- the piece before that: importing the bank's CSV, storing every line with its raw
-- row for audit, and matching lines to ledger postings. Confirming a match sets the
-- existing IsReconciled flag, so Xorva's GetBankReconciliation keeps working unchanged.
--
-- Adaptations: bank_accounts → existing "BankAccounts" (columns added, not re-created);
-- entity_id → TenantId+CompanyId; PG enums → varchar+CHECK; auth.uid() → app.current_user_id();
-- matched_voucher_id → MatchedJournalLineId (the ledger line is what reconciles) with
-- MatchedVoucherId kept for the register link.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enrich existing BankAccounts (TrueLedge bank_accounts extras)
-- ----------------------------------------------------------------------------
ALTER TABLE "BankAccounts"
  ADD COLUMN IF NOT EXISTS "SwiftCode"      VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "Branch"         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "Currency"       VARCHAR(3)  NOT NULL DEFAULT 'AED',
  ADD COLUMN IF NOT EXISTS "OpeningBalance" NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "StatementFormat" VARCHAR(20);   -- last detected format: enbd/adcb/fab/mashreq/rak/dib/unknown

-- ----------------------------------------------------------------------------
-- 2. BankStatements — one per CSV upload
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "BankStatements" (
  "Id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "TenantId"        UUID NOT NULL,
  "CompanyId"       UUID NOT NULL REFERENCES "Companies"("Id") ON DELETE RESTRICT,
  "BankAccountId"   UUID NOT NULL REFERENCES "BankAccounts"("Id") ON DELETE RESTRICT,

  "StatementDate"   DATE,
  "PeriodFrom"      DATE NOT NULL,
  "PeriodTo"        DATE NOT NULL,

  "OpeningBalance"  NUMERIC(18,2),
  "ClosingBalance"  NUMERIC(18,2),
  "TotalDebits"     NUMERIC(18,2) NOT NULL DEFAULT 0,
  "TotalCredits"    NUMERIC(18,2) NOT NULL DEFAULT 0,
  "LineCount"       INT NOT NULL DEFAULT 0,

  "SourceFile"      VARCHAR(260),
  "SourceFormat"    VARCHAR(20),
  "ImportStatus"    VARCHAR(20) NOT NULL DEFAULT 'Pending'
                    CHECK ("ImportStatus" IN ('Pending','Processing','Completed','Failed','PartiallyCompleted')),
  "ImportErrors"    JSONB,

  "ImportedAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "ImportedBy"      UUID REFERENCES "Users"("Id") ON DELETE SET NULL,
  "CreatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "UpdatedAt"       TIMESTAMPTZ,
  "CreatedBy"       UUID REFERENCES "Users"("Id") ON DELETE SET NULL,
  "UpdatedBy"       UUID REFERENCES "Users"("Id") ON DELETE SET NULL,

  CONSTRAINT "CK_BankStatements_Period" CHECK ("PeriodFrom" <= "PeriodTo")
);
CREATE INDEX IF NOT EXISTS "IX_BankStatements_CompanyId"     ON "BankStatements" ("CompanyId");
CREATE INDEX IF NOT EXISTS "IX_BankStatements_BankAccountId" ON "BankStatements" ("BankAccountId");
CREATE INDEX IF NOT EXISTS "IX_BankStatements_Period"        ON "BankStatements" ("PeriodFrom", "PeriodTo");

-- ----------------------------------------------------------------------------
-- 3. MatchRules — regex patterns → suggested account / contact / voucher type
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "BankMatchRules" (
  "Id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "TenantId"          UUID NOT NULL,
  "CompanyId"         UUID NOT NULL REFERENCES "Companies"("Id") ON DELETE RESTRICT,
  "RuleName"          VARCHAR(100) NOT NULL,
  "Description"       VARCHAR(500),
  "Pattern"           VARCHAR(500) NOT NULL,            -- POSIX regex, case-insensitive
  "PatternField"      VARCHAR(20)  NOT NULL DEFAULT 'Description'
                      CHECK ("PatternField" IN ('Description','Reference','ChequeNumber')),
  "TargetAccountId"   UUID REFERENCES "Accounts"("Id") ON DELETE SET NULL,
  "TargetContactId"   UUID REFERENCES "Contacts"("Id") ON DELETE SET NULL,
  "TargetVoucherType" VARCHAR(20)
                      CHECK ("TargetVoucherType" IS NULL OR "TargetVoucherType" IN ('Receipt','Payment','Contra','Journal')),
  "Priority"          INT NOT NULL DEFAULT 100,         -- lower = checked first
  "IsActive"          BOOLEAN NOT NULL DEFAULT true,
  "TimesUsed"         INT NOT NULL DEFAULT 0,
  "LastUsedAt"        TIMESTAMPTZ,
  "CreatedAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "UpdatedAt"         TIMESTAMPTZ,
  "CreatedBy"         UUID REFERENCES "Users"("Id") ON DELETE SET NULL,
  "UpdatedBy"         UUID REFERENCES "Users"("Id") ON DELETE SET NULL,

  CONSTRAINT "UQ_BankMatchRules_CompanyId_RuleName" UNIQUE ("CompanyId", "RuleName")
);
CREATE INDEX IF NOT EXISTS "IX_BankMatchRules_CompanyId_Priority" ON "BankMatchRules" ("CompanyId", "Priority");

-- ----------------------------------------------------------------------------
-- 4. BankStatementLines — every parsed transaction, raw row preserved
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "BankStatementLines" (
  "Id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "TenantId"            UUID NOT NULL,
  "CompanyId"           UUID NOT NULL REFERENCES "Companies"("Id") ON DELETE RESTRICT,
  "StatementId"         UUID NOT NULL REFERENCES "BankStatements"("Id") ON DELETE CASCADE,
  "BankAccountId"       UUID NOT NULL REFERENCES "BankAccounts"("Id") ON DELETE RESTRICT,

  "LineDate"            DATE NOT NULL,
  "ValueDate"           DATE,
  "Description"         VARCHAR(1000) NOT NULL,
  "Reference"           VARCHAR(200),
  "ChequeNumber"        VARCHAR(50),

  "Debit"               NUMERIC(18,2) NOT NULL DEFAULT 0,   -- money OUT of the bank
  "Credit"              NUMERIC(18,2) NOT NULL DEFAULT 0,   -- money IN
  "Balance"             NUMERIC(18,2),

  "RawData"             JSONB,
  "LineNumber"          INT NOT NULL DEFAULT 0,

  "MatchStatus"         VARCHAR(20) NOT NULL DEFAULT 'Unmatched'
                        CHECK ("MatchStatus" IN ('Unmatched','Suggested','Matched','Ignored')),
  "MatchedJournalLineId" UUID REFERENCES "JournalLines"("Id") ON DELETE SET NULL,
  "MatchedVoucherId"    UUID REFERENCES "Vouchers"("Id") ON DELETE SET NULL,
  "MatchRuleId"         UUID REFERENCES "BankMatchRules"("Id") ON DELETE SET NULL,
  "SuggestedAccountId"  UUID REFERENCES "Accounts"("Id") ON DELETE SET NULL,
  "SuggestedContactId"  UUID REFERENCES "Contacts"("Id") ON DELETE SET NULL,
  "MatchedAt"           TIMESTAMPTZ,
  "MatchedBy"           UUID REFERENCES "Users"("Id") ON DELETE SET NULL,

  "CreatedAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "UpdatedAt"           TIMESTAMPTZ,
  "CreatedBy"           UUID REFERENCES "Users"("Id") ON DELETE SET NULL,
  "UpdatedBy"           UUID REFERENCES "Users"("Id") ON DELETE SET NULL,

  CONSTRAINT "CK_BankStatementLines_Debit"  CHECK ("Debit" >= 0),
  CONSTRAINT "CK_BankStatementLines_Credit" CHECK ("Credit" >= 0),
  CONSTRAINT "CK_BankStatementLines_OneSide" CHECK ("Debit" = 0 OR "Credit" = 0),
  CONSTRAINT "UQ_BankStatementLines_MatchedJournalLine" UNIQUE ("MatchedJournalLineId")
);
CREATE INDEX IF NOT EXISTS "IX_BankStatementLines_StatementId"   ON "BankStatementLines" ("StatementId");
CREATE INDEX IF NOT EXISTS "IX_BankStatementLines_CompanyId"     ON "BankStatementLines" ("CompanyId");
CREATE INDEX IF NOT EXISTS "IX_BankStatementLines_BankAccountId" ON "BankStatementLines" ("BankAccountId");
CREATE INDEX IF NOT EXISTS "IX_BankStatementLines_LineDate"      ON "BankStatementLines" ("LineDate" DESC);
CREATE INDEX IF NOT EXISTS "IX_BankStatementLines_MatchStatus"   ON "BankStatementLines" ("CompanyId", "MatchStatus");

-- Duplicate-import guard: the same (account, date, amounts, description) line may not
-- be imported twice. Bank CSVs frequently overlap when re-downloaded.
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_BankStatementLines_Fingerprint"
  ON "BankStatementLines" ("BankAccountId", "LineDate", "Debit", "Credit", md5(lower(btrim("Description"))), COALESCE("Reference", ''));

-- ----------------------------------------------------------------------------
-- 5. import_bank_statement — atomic (TrueLedge did header + lines in 2 calls)
-- ----------------------------------------------------------------------------
-- p_lines: [{ line_date, value_date, description, reference, cheque_number, debit, credit, balance, raw_data }]
-- Returns the statement id. Lines already present (fingerprint) are skipped and counted.
CREATE OR REPLACE FUNCTION accounting.import_bank_statement(
  p_bank_account_id UUID,
  p_source_file     TEXT,
  p_source_format   TEXT,
  p_lines           JSONB,
  p_statement_date  DATE DEFAULT NULL,
  p_opening_balance NUMERIC DEFAULT NULL,
  p_closing_balance NUMERIC DEFAULT NULL
)
RETURNS TABLE (statement_id UUID, lines_imported INT, lines_skipped INT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_user      UUID := app.current_user_id();
  v_acct      RECORD;
  v_stmt_id   UUID := gen_random_uuid();
  v_from      DATE;
  v_to        DATE;
  v_line      JSONB;
  v_n         INT := 0;
  v_imported  INT := 0;
  v_skipped   INT := 0;
  v_debits    NUMERIC(18,2) := 0;
  v_credits   NUMERIC(18,2) := 0;
BEGIN
  SELECT "Id", "TenantId", "CompanyId" INTO v_acct FROM "BankAccounts" WHERE "Id" = p_bank_account_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bank account not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'The statement has no lines to import.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT min((l->>'line_date')::date), max((l->>'line_date')::date)
    INTO v_from, v_to
  FROM jsonb_array_elements(p_lines) l;

  INSERT INTO "BankStatements" ("Id", "TenantId", "CompanyId", "BankAccountId", "StatementDate", "PeriodFrom", "PeriodTo",
                                "OpeningBalance", "ClosingBalance", "SourceFile", "SourceFormat", "ImportStatus", "ImportedBy", "CreatedBy")
  VALUES (v_stmt_id, v_acct."TenantId", v_acct."CompanyId", p_bank_account_id, p_statement_date, v_from, v_to,
          p_opening_balance, p_closing_balance, p_source_file, p_source_format, 'Processing', v_user, v_user);

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_n := v_n + 1;
    BEGIN
      INSERT INTO "BankStatementLines" ("TenantId", "CompanyId", "StatementId", "BankAccountId",
        "LineDate", "ValueDate", "Description", "Reference", "ChequeNumber", "Debit", "Credit", "Balance", "RawData", "LineNumber", "CreatedBy")
      VALUES (v_acct."TenantId", v_acct."CompanyId", v_stmt_id, p_bank_account_id,
        (v_line->>'line_date')::date,
        NULLIF(v_line->>'value_date', '')::date,
        COALESCE(NULLIF(btrim(v_line->>'description'), ''), '(no description)'),
        NULLIF(btrim(v_line->>'reference'), ''),
        NULLIF(btrim(v_line->>'cheque_number'), ''),
        round(COALESCE((v_line->>'debit')::numeric, 0), 2),
        round(COALESCE((v_line->>'credit')::numeric, 0), 2),
        NULLIF(v_line->>'balance', '')::numeric,
        v_line->'raw_data',
        v_n, v_user);
      v_imported := v_imported + 1;
      v_debits  := v_debits  + round(COALESCE((v_line->>'debit')::numeric, 0), 2);
      v_credits := v_credits + round(COALESCE((v_line->>'credit')::numeric, 0), 2);
    EXCEPTION WHEN unique_violation THEN
      v_skipped := v_skipped + 1;          -- already imported earlier (fingerprint)
    END;
  END LOOP;

  UPDATE "BankStatements"
     SET "TotalDebits" = v_debits, "TotalCredits" = v_credits, "LineCount" = v_imported,
         "ImportStatus" = CASE WHEN v_imported = 0 THEN 'Failed' WHEN v_skipped > 0 THEN 'PartiallyCompleted' ELSE 'Completed' END,
         "ImportErrors" = CASE WHEN v_skipped > 0 THEN jsonb_build_object('duplicates_skipped', v_skipped) END
   WHERE "Id" = v_stmt_id;

  UPDATE "BankAccounts" SET "StatementFormat" = p_source_format, "UpdatedAt" = now() WHERE "Id" = p_bank_account_id;

  -- Apply rules immediately so the review screen opens with suggestions.
  PERFORM accounting.suggest_bank_matches(v_stmt_id);

  RETURN QUERY SELECT v_stmt_id, v_imported, v_skipped;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. suggest_bank_matches — rules + exact ledger matches
-- ----------------------------------------------------------------------------
-- Two passes over the statement's Unmatched lines:
--   (a) exact ledger match: an unreconciled JournalLine on the bank's GL account with the
--       same amount on the same side within ±3 days → Suggested + MatchedJournalLineId
--   (b) regex rules (priority order) → SuggestedAccountId / SuggestedContactId / MatchRuleId
--       (tells the entry screen what voucher to create for an unbooked line)
CREATE OR REPLACE FUNCTION accounting.suggest_bank_matches(p_statement_id UUID)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_company UUID;
  v_gl      UUID;
  v_count   INT := 0;
  v_rec     RECORD;
  v_rule    RECORD;
  v_jl      UUID;
BEGIN
  SELECT s."CompanyId", b."AccountId" INTO v_company, v_gl
  FROM "BankStatements" s JOIN "BankAccounts" b ON b."Id" = s."BankAccountId"
  WHERE s."Id" = p_statement_id;
  IF v_gl IS NULL THEN RETURN 0; END IF;

  FOR v_rec IN
    SELECT * FROM "BankStatementLines" WHERE "StatementId" = p_statement_id AND "MatchStatus" = 'Unmatched'
    ORDER BY "LineNumber"
  LOOP
    -- (a) exact ledger match. Bank DEBIT (money out) = ledger CREDIT on the bank GL, and vice versa.
    SELECT l."Id" INTO v_jl
    FROM "JournalLines" l
    JOIN "JournalEntries" e ON e."Id" = l."JournalEntryId"
    WHERE l."AccountId" = v_gl
      AND l."CompanyId" = v_company
      AND NOT l."IsReconciled"
      AND e."Status" = 'Posted'
      AND ((v_rec."Debit"  > 0 AND l."Credit" = v_rec."Debit") OR
           (v_rec."Credit" > 0 AND l."Debit"  = v_rec."Credit"))
      AND e."Date"::date BETWEEN v_rec."LineDate" - 3 AND v_rec."LineDate" + 3
      AND NOT EXISTS (SELECT 1 FROM "BankStatementLines" x WHERE x."MatchedJournalLineId" = l."Id")
    ORDER BY abs(e."Date"::date - v_rec."LineDate"), e."Date"
    LIMIT 1;

    IF v_jl IS NOT NULL THEN
      UPDATE "BankStatementLines"
         SET "MatchStatus" = 'Suggested', "MatchedJournalLineId" = v_jl,
             "MatchedVoucherId" = (SELECT e2."VoucherId" FROM "JournalLines" l2 JOIN "JournalEntries" e2 ON e2."Id" = l2."JournalEntryId" WHERE l2."Id" = v_jl)
       WHERE "Id" = v_rec."Id";
      v_count := v_count + 1;
      CONTINUE;
    END IF;

    -- (b) rules
    FOR v_rule IN
      SELECT * FROM "BankMatchRules"
      WHERE "CompanyId" = v_company AND "IsActive"
      ORDER BY "Priority", "CreatedAt"
    LOOP
      IF (CASE v_rule."PatternField"
            WHEN 'Reference'    THEN COALESCE(v_rec."Reference", '')
            WHEN 'ChequeNumber' THEN COALESCE(v_rec."ChequeNumber", '')
            ELSE v_rec."Description" END) ~* v_rule."Pattern" THEN
        UPDATE "BankStatementLines"
           SET "MatchStatus" = 'Suggested', "MatchRuleId" = v_rule."Id",
               "SuggestedAccountId" = v_rule."TargetAccountId", "SuggestedContactId" = v_rule."TargetContactId"
         WHERE "Id" = v_rec."Id";
        UPDATE "BankMatchRules" SET "TimesUsed" = "TimesUsed" + 1, "LastUsedAt" = now() WHERE "Id" = v_rule."Id";
        v_count := v_count + 1;
        EXIT;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. confirm_bank_match / unmatch / ignore — reconcile the single ledger
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION accounting.confirm_bank_match(p_line_id UUID, p_journal_line_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_line RECORD;
  v_jl   RECORD;
  v_gl   UUID;
BEGIN
  SELECT * INTO v_line FROM "BankStatementLines" WHERE "Id" = p_line_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bank line not found.' USING ERRCODE = 'no_data_found'; END IF;
  IF v_line."MatchStatus" = 'Matched' THEN RAISE EXCEPTION 'This bank line is already matched.' USING ERRCODE = 'check_violation'; END IF;

  SELECT "AccountId" INTO v_gl FROM "BankAccounts" WHERE "Id" = v_line."BankAccountId";

  SELECT l."Id", l."AccountId", l."CompanyId", l."IsReconciled", l."Debit", l."Credit", e."Status", e."VoucherId"
    INTO v_jl
  FROM "JournalLines" l JOIN "JournalEntries" e ON e."Id" = l."JournalEntryId"
  WHERE l."Id" = p_journal_line_id FOR UPDATE OF l;
  IF NOT FOUND THEN RAISE EXCEPTION 'Journal line not found.' USING ERRCODE = 'no_data_found'; END IF;
  IF v_jl."CompanyId" <> v_line."CompanyId" THEN RAISE EXCEPTION 'Journal line belongs to a different company.' USING ERRCODE = 'check_violation'; END IF;
  IF v_jl."AccountId" <> v_gl THEN RAISE EXCEPTION 'Journal line is not on this bank account''s ledger account.' USING ERRCODE = 'check_violation'; END IF;
  IF v_jl."Status" <> 'Posted' THEN RAISE EXCEPTION 'Only posted journal lines can be reconciled.' USING ERRCODE = 'check_violation'; END IF;
  IF v_jl."IsReconciled" THEN RAISE EXCEPTION 'That journal line is already reconciled.' USING ERRCODE = 'check_violation'; END IF;
  IF NOT ((v_line."Debit" > 0 AND v_jl."Credit" = v_line."Debit") OR (v_line."Credit" > 0 AND v_jl."Debit" = v_line."Credit")) THEN
    RAISE EXCEPTION 'Amounts do not agree: bank % / % vs ledger % / %.', v_line."Debit", v_line."Credit", v_jl."Debit", v_jl."Credit"
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE "JournalLines" SET "IsReconciled" = true, "UpdatedAt" = now(), "UpdatedBy" = app.current_user_id() WHERE "Id" = p_journal_line_id;
  UPDATE "BankStatementLines"
     SET "MatchStatus" = 'Matched', "MatchedJournalLineId" = p_journal_line_id, "MatchedVoucherId" = v_jl."VoucherId",
         "MatchedAt" = now(), "MatchedBy" = app.current_user_id()
   WHERE "Id" = p_line_id;
END;
$$;

CREATE OR REPLACE FUNCTION accounting.unmatch_bank_line(p_line_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_jl UUID;
BEGIN
  SELECT "MatchedJournalLineId" INTO v_jl FROM "BankStatementLines" WHERE "Id" = p_line_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bank line not found.' USING ERRCODE = 'no_data_found'; END IF;
  IF v_jl IS NOT NULL THEN
    UPDATE "JournalLines" SET "IsReconciled" = false, "UpdatedAt" = now(), "UpdatedBy" = app.current_user_id() WHERE "Id" = v_jl;
  END IF;
  UPDATE "BankStatementLines"
     SET "MatchStatus" = 'Unmatched', "MatchedJournalLineId" = NULL, "MatchedVoucherId" = NULL, "MatchRuleId" = NULL,
         "SuggestedAccountId" = NULL, "SuggestedContactId" = NULL, "MatchedAt" = NULL, "MatchedBy" = NULL
   WHERE "Id" = p_line_id;
END;
$$;

CREATE OR REPLACE FUNCTION accounting.ignore_bank_line(p_line_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM accounting.unmatch_bank_line(p_line_id);
  UPDATE "BankStatementLines" SET "MatchStatus" = 'Ignored' WHERE "Id" = p_line_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. Audit + RLS
-- ----------------------------------------------------------------------------
SELECT app.install_audit_trigger('"BankStatements"');
SELECT app.install_audit_trigger('"BankStatementLines"');
SELECT app.install_audit_trigger('"BankMatchRules"');
SELECT app.install_company_rls('"BankStatements"');
SELECT app.install_company_rls('"BankStatementLines"');
SELECT app.install_company_rls('"BankMatchRules"');
