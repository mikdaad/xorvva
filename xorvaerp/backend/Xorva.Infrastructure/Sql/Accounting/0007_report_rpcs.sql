-- ============================================================================
-- Xorva Accounting — ported from TrueLedge 00008 (get_balance_sheet) +
-- actions/reports.ts (getLedgerStatement, getTransactionRegister) +
-- actions/journal.ts (getTrialBalance).
-- Script 0007: report RPCs — hierarchical balance sheet, ledger statement,
--              transaction register (daybook), trial balance, cost-centre report
-- ============================================================================
-- Xorva already has flat C# report handlers (GetBalanceSheet, GetProfitAndLoss,
-- GetGeneralLedger, GetCashFlow, GetTrialBalance). They stay. These RPCs add the
-- TrueLedge features the new screens and PDF/XLSX export need: group roll-ups in
-- the account tree, drill-down ids, a single-account statement with running
-- balance, and the unified voucher register. They are READ-ONLY, run under the
-- caller's RLS context, and read the same single ledger (JournalEntries/Lines).
--
-- Status filter: Xorva voids by reversal — the original entry is flagged 'Voided'
-- but STAYS in the ledger and its reversal is posted alongside it, so the pair nets
-- to zero. Xorva's C# reports therefore never filter on Status; these RPCs include
-- both 'Posted' and 'Voided' (and exclude only 'Draft') for identical figures.
--
-- Conventions: JSONB results use camelCase keys identical to TrueLedge's
-- src/lib/reports/types.ts, so the ported React components and the PDF/XLSX
-- generators consume them without a mapping layer. Set-returning RPCs are used
-- where the caller wants paging.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Helpers
-- ----------------------------------------------------------------------------
-- Company scope guard for reports: NULL company = tenant-wide (CEO consolidated)
-- when the session has cross-company access; otherwise the session's company.
CREATE OR REPLACE FUNCTION accounting.resolve_report_company(p_company_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF p_company_id IS NOT NULL THEN
    IF NOT app.has_company_access(app.current_tenant_id(), p_company_id) THEN
      RAISE EXCEPTION 'You do not have access to this company.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN p_company_id;
  END IF;
  IF app.has_cross_company_access() THEN RETURN NULL; END IF;   -- consolidated
  RETURN app.current_company_id();
END;
$$;

-- Company display info for report headers.
CREATE OR REPLACE FUNCTION accounting.report_header(p_company_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_company_id IS NULL THEN
      jsonb_build_object('entityId', NULL, 'entityName', COALESCE((SELECT "Name" FROM "Tenants" WHERE "Id" = app.current_tenant_id()), 'Consolidated') || ' (consolidated)',
                         'baseCurrency', COALESCE((SELECT "BaseCurrency" FROM "AccountingSettings" WHERE "TenantId" = app.current_tenant_id() LIMIT 1), 'AED'))
    ELSE
      jsonb_build_object('entityId', c."Id", 'entityName', COALESCE(s."MailingName", s."LegalName", c."Name"),
                         'baseCurrency', COALESCE(s."BaseCurrency", c."Currency", 'AED'),
                         'trn', s."TaxRegistrationNumber")
  END
  FROM "Companies" c LEFT JOIN "AccountingSettings" s ON s."CompanyId" = c."Id"
  WHERE c."Id" = COALESCE(p_company_id, app.current_company_id())
  LIMIT 1;
$$;

-- ----------------------------------------------------------------------------
-- 1. get_balance_sheet — hierarchical, with group roll-ups (TrueLedge 00008 +
--    the tree build that reports.ts did in TypeScript, now done in SQL)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION accounting.get_balance_sheet(
  p_company_id UUID DEFAULT NULL,
  p_as_of      DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql          -- VOLATILE: builds a temp table (DML is not allowed in STABLE functions)
AS $$
DECLARE
  v_company UUID := accounting.resolve_report_company(p_company_id);
  v_retained NUMERIC(18,2) := 0;
  v_assets NUMERIC(18,2) := 0;
  v_liab   NUMERIC(18,2) := 0;
  v_equity NUMERIC(18,2) := 0;
  v_assets_json JSONB;
  v_liab_json   JSONB;
  v_equity_json JSONB;
BEGIN
  -- Per-account natural balances up to as-of (posted only).
  CREATE TEMP TABLE IF NOT EXISTS _bs (
    id UUID, company_id UUID, name TEXT, code TEXT, parent_id UUID, is_group BOOL, account_type TEXT,
    debit NUMERIC(18,2), credit NUMERIC(18,2), amount NUMERIC(18,2), depth INT, sort TEXT
  ) ON COMMIT DROP;
  TRUNCATE _bs;

  INSERT INTO _bs (id, company_id, name, code, parent_id, is_group, account_type, debit, credit, amount)
  SELECT a."Id", a."CompanyId", a."Name", a."Code", a."ParentAccountId", a."IsGroup", a."AccountType",
         COALESCE(m.debit, 0), COALESCE(m.credit, 0),
         CASE WHEN a."AccountType" IN ('Asset', 'Expense')
              THEN COALESCE(m.debit, 0) - COALESCE(m.credit, 0)
              ELSE COALESCE(m.credit, 0) - COALESCE(m.debit, 0) END
  FROM "Accounts" a
  LEFT JOIN (
    SELECT l."AccountId", sum(l."Debit") AS debit, sum(l."Credit") AS credit
    FROM "JournalLines" l JOIN "JournalEntries" e ON e."Id" = l."JournalEntryId"
    WHERE e."Status" IN ('Posted', 'Voided') AND e."Date"::date <= p_as_of
      AND (v_company IS NULL OR e."CompanyId" = v_company)
    GROUP BY l."AccountId"
  ) m ON m."AccountId" = a."Id"
  WHERE a."IsActive" AND (v_company IS NULL OR a."CompanyId" = v_company);

  -- Roll leaf balances up into every ancestor group (any depth).
  WITH RECURSIVE anc AS (
    SELECT id AS leaf, parent_id AS ancestor FROM _bs WHERE NOT is_group AND parent_id IS NOT NULL
    UNION ALL
    SELECT anc.leaf, b.parent_id FROM anc JOIN _bs b ON b.id = anc.ancestor WHERE b.parent_id IS NOT NULL
  ), rolled AS (
    SELECT anc.ancestor AS id, sum(l.amount) AS amount, sum(l.debit) AS debit, sum(l.credit) AS credit
    FROM anc JOIN _bs l ON l.id = anc.leaf GROUP BY anc.ancestor
  )
  UPDATE _bs b SET amount = r.amount, debit = r.debit, credit = r.credit FROM rolled r WHERE b.id = r.id AND b.is_group;

  -- Retained earnings = revenue − expense to date (both already "natural").
  SELECT COALESCE(sum(CASE WHEN account_type = 'Revenue' THEN amount WHEN account_type = 'Expense' THEN -amount END), 0)
    INTO v_retained FROM _bs WHERE NOT is_group AND account_type IN ('Revenue', 'Expense');
  SELECT COALESCE(sum(amount), 0) INTO v_assets FROM _bs WHERE NOT is_group AND account_type = 'Asset';
  SELECT COALESCE(sum(amount), 0) INTO v_liab   FROM _bs WHERE NOT is_group AND account_type = 'Liability';
  SELECT COALESCE(sum(amount), 0) INTO v_equity FROM _bs WHERE NOT is_group AND account_type = 'Equity';
  v_equity := v_equity + v_retained;

  v_assets_json := jsonb_build_object('total', v_assets, 'nodes', accounting._bs_tree('Asset'));
  v_liab_json   := jsonb_build_object('total', v_liab,   'nodes', accounting._bs_tree('Liability'));
  v_equity_json := jsonb_build_object('total', v_equity, 'nodes',
                     accounting._bs_tree('Equity') || jsonb_build_array(jsonb_build_object(
                       'id', 'retained-earnings-node', 'name', 'Retained Earnings (Net Profit/Loss)', 'code', '3999',
                       'isGroup', false, 'amount', v_retained, 'drillAccountId', NULL, 'children', '[]'::jsonb)));

  RETURN accounting.report_header(v_company) || jsonb_build_object(
    'asOf', p_as_of,
    'assets', v_assets_json,
    'liabilities', v_liab_json,
    'equity', v_equity_json,
    'retainedEarnings', v_retained,
    'totalAssets', v_assets,
    'totalLiabilitiesAndEquity', v_liab + v_equity,
    'difference', v_assets - (v_liab + v_equity)
  );
END;
$$;

-- Recursive tree builder over the temp table (children ordered by code, zero
-- leaves dropped, empty groups dropped — same filter as reports.ts filterNonZero).
CREATE OR REPLACE FUNCTION accounting._bs_tree(p_type TEXT, p_parent UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_out JSONB := '[]'::jsonb;
  v_row RECORD;
  v_children JSONB;
BEGIN
  FOR v_row IN
    SELECT * FROM _bs
    WHERE account_type = p_type AND parent_id IS NOT DISTINCT FROM p_parent
    ORDER BY code NULLS LAST, name
  LOOP
    v_children := CASE WHEN v_row.is_group THEN accounting._bs_tree(p_type, v_row.id) ELSE '[]'::jsonb END;
    IF v_row.is_group AND jsonb_array_length(v_children) = 0 AND v_row.amount = 0 THEN CONTINUE; END IF;
    IF NOT v_row.is_group AND v_row.amount = 0 THEN CONTINUE; END IF;
    v_out := v_out || jsonb_build_object(
      'id', v_row.id, 'name', v_row.name, 'code', v_row.code, 'isGroup', v_row.is_group,
      'amount', v_row.amount,
      'drillAccountId', CASE WHEN v_row.is_group THEN NULL ELSE v_row.id END,
      'children', v_children);
  END LOOP;
  RETURN v_out;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. get_ledger_statement — one account, opening + running balance (reports.ts §2)
-- ----------------------------------------------------------------------------
-- Running balance is shown on the account's NATURAL side (debit accounts grow with
-- debits), which is what Xorva's GetGeneralLedger does too. Optional cost-centre filter.
CREATE OR REPLACE FUNCTION accounting.get_ledger_statement(
  p_account_id     UUID,
  p_from           DATE DEFAULT NULL,
  p_to             DATE DEFAULT NULL,
  p_cost_centre_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_acct    RECORD;
  v_sign    INT;
  v_opening NUMERIC(18,2) := 0;
  v_lines   JSONB;
  v_tot_dr  NUMERIC(18,2) := 0;
  v_tot_cr  NUMERIC(18,2) := 0;
BEGIN
  SELECT "Id", "CompanyId", "Name", "Code", "AccountType", "NormalBalance" INTO v_acct FROM "Accounts" WHERE "Id" = p_account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found.' USING ERRCODE = 'no_data_found'; END IF;
  v_sign := CASE WHEN v_acct."NormalBalance" = 'Debit' THEN 1 ELSE -1 END;

  IF p_from IS NOT NULL THEN
    SELECT COALESCE(sum((l."Debit" - l."Credit") * v_sign), 0) INTO v_opening
    FROM "JournalLines" l JOIN "JournalEntries" e ON e."Id" = l."JournalEntryId"
    WHERE l."AccountId" = p_account_id AND e."Status" IN ('Posted', 'Voided') AND e."Date"::date < p_from
      AND (p_cost_centre_id IS NULL OR l."CostCentreId" = p_cost_centre_id);
  END IF;

  WITH mv AS (
    SELECT e."Date"::date AS d, e."EntryNumber", e."Id" AS entry_id, e."VoucherId", v."VoucherNumber", v."VoucherType",
           COALESCE(l."Description", e."Description") AS narration, l."Debit", l."Credit", e."CreatedAt", l."Id" AS line_id,
           c."Name" AS contact_name, cc."Name" AS cost_centre
    FROM "JournalLines" l
    JOIN "JournalEntries" e ON e."Id" = l."JournalEntryId"
    LEFT JOIN "Vouchers" v ON v."Id" = e."VoucherId"
    LEFT JOIN "Contacts" c ON c."Id" = l."ContactId"
    LEFT JOIN "CostCentres" cc ON cc."Id" = l."CostCentreId"
    WHERE l."AccountId" = p_account_id AND e."Status" IN ('Posted', 'Voided')
      AND (p_from IS NULL OR e."Date"::date >= p_from)
      AND (p_to   IS NULL OR e."Date"::date <= p_to)
      AND (p_cost_centre_id IS NULL OR l."CostCentreId" = p_cost_centre_id)
  ), run AS (
    SELECT mv.*, v_opening + sum((mv."Debit" - mv."Credit") * v_sign) OVER (ORDER BY mv.d, mv."CreatedAt", mv.line_id) AS running
    FROM mv
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'date', d, 'entryNumber', "EntryNumber", 'journalEntryId', entry_id,
           'voucherId', "VoucherId", 'voucherNumber', "VoucherNumber", 'voucherType', "VoucherType",
           'narration', narration, 'contactName', contact_name, 'costCentre', cost_centre,
           'debit', "Debit", 'credit', "Credit", 'runningBalance', running) ORDER BY d, "CreatedAt", line_id), '[]'::jsonb),
         COALESCE(sum("Debit"), 0), COALESCE(sum("Credit"), 0)
    INTO v_lines, v_tot_dr, v_tot_cr
  FROM run;

  RETURN accounting.report_header(v_acct."CompanyId") || jsonb_build_object(
    'accountId', v_acct."Id", 'accountName', v_acct."Name", 'accountCode', v_acct."Code",
    'accountType', v_acct."AccountType", 'normalBalance', v_acct."NormalBalance",
    'from', p_from, 'to', p_to, 'costCentreId', p_cost_centre_id,
    'openingBalance', v_opening,
    'lines', v_lines,
    'totalDebit', v_tot_dr, 'totalCredit', v_tot_cr,
    'closingBalance', v_opening + (v_tot_dr - v_tot_cr) * v_sign
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. get_transaction_register — unified daybook (reports.ts §3 + voucher.ts getVouchers)
-- ----------------------------------------------------------------------------
-- Set-returning for server-side paging. total_count/total_base_amount repeat on every
-- row (window aggregates) so the caller gets totals in the same round-trip.
CREATE OR REPLACE FUNCTION accounting.get_transaction_register(
  p_company_id   UUID DEFAULT NULL,
  p_from         DATE DEFAULT NULL,
  p_to           DATE DEFAULT NULL,
  p_voucher_type TEXT DEFAULT NULL,
  p_status       TEXT DEFAULT NULL,
  p_contact_id   UUID DEFAULT NULL,
  p_search       TEXT DEFAULT NULL,
  p_limit        INT  DEFAULT 100,
  p_offset       INT  DEFAULT 0
)
RETURNS TABLE (
  id UUID, company_id UUID, voucher_date DATE, voucher_number VARCHAR, voucher_type VARCHAR, status VARCHAR,
  contact_name VARCHAR, reference VARCHAR, narration VARCHAR, currency VARCHAR,
  total_amount NUMERIC, base_total_amount NUMERIC, amount_due NUMERIC,
  journal_entry_id UUID, entry_number VARCHAR, created_by_name TEXT, created_at TIMESTAMPTZ,
  total_count BIGINT, total_base_amount NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_company UUID := accounting.resolve_report_company(p_company_id);
BEGIN
  RETURN QUERY
  SELECT v."Id", v."CompanyId", v."VoucherDate", v."VoucherNumber", v."VoucherType", v."Status",
         c."Name", v."Reference", v."Narration", v."Currency",
         v."TotalAmount", v."BaseTotalAmount", v."AmountDue",
         v."JournalEntryId", e."EntryNumber",
         NULLIF(btrim(COALESCE(u."FirstName", '') || ' ' || COALESCE(u."LastName", '')), '')::text,
         v."CreatedAt",
         count(*) OVER (), COALESCE(sum(v."BaseTotalAmount") OVER (), 0)
  FROM "Vouchers" v
  LEFT JOIN "Contacts" c ON c."Id" = v."ContactId"
  LEFT JOIN "JournalEntries" e ON e."Id" = v."JournalEntryId"
  LEFT JOIN "Users" u ON u."Id" = v."CreatedBy"
  WHERE (v_company IS NULL OR v."CompanyId" = v_company)
    AND (p_from IS NULL OR v."VoucherDate" >= p_from)
    AND (p_to   IS NULL OR v."VoucherDate" <= p_to)
    AND (p_voucher_type IS NULL OR p_voucher_type = 'all' OR v."VoucherType" = p_voucher_type)
    AND (p_status IS NULL OR p_status = 'all' OR v."Status" = p_status)
    AND (p_contact_id IS NULL OR v."ContactId" = p_contact_id)
    AND (p_search IS NULL OR btrim(p_search) = '' OR
         v."VoucherNumber" ILIKE '%' || p_search || '%' OR
         v."Narration"     ILIKE '%' || p_search || '%' OR
         v."Reference"     ILIKE '%' || p_search || '%' OR
         c."Name"          ILIKE '%' || p_search || '%')
  ORDER BY v."VoucherDate" DESC, v."CreatedAt" DESC
  LIMIT GREATEST(p_limit, 1) OFFSET GREATEST(p_offset, 0);
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. get_trial_balance — per account debit/credit totals + closing (journal.ts)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION accounting.get_trial_balance(
  p_company_id UUID DEFAULT NULL,
  p_from       DATE DEFAULT NULL,
  p_to         DATE DEFAULT NULL
)
RETURNS TABLE (
  account_id UUID, code VARCHAR, name VARCHAR, account_type VARCHAR, account_sub_type VARCHAR, is_group BOOLEAN,
  opening_debit NUMERIC, opening_credit NUMERIC, period_debit NUMERIC, period_credit NUMERIC,
  closing_debit NUMERIC, closing_credit NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_company UUID := accounting.resolve_report_company(p_company_id);
BEGIN
  RETURN QUERY
  WITH mv AS (
    SELECT l."AccountId",
           sum(CASE WHEN p_from IS NOT NULL AND e."Date"::date <  p_from THEN l."Debit"  ELSE 0 END) AS o_dr,
           sum(CASE WHEN p_from IS NOT NULL AND e."Date"::date <  p_from THEN l."Credit" ELSE 0 END) AS o_cr,
           sum(CASE WHEN (p_from IS NULL OR e."Date"::date >= p_from) THEN l."Debit"  ELSE 0 END) AS p_dr,
           sum(CASE WHEN (p_from IS NULL OR e."Date"::date >= p_from) THEN l."Credit" ELSE 0 END) AS p_cr
    FROM "JournalLines" l JOIN "JournalEntries" e ON e."Id" = l."JournalEntryId"
    WHERE e."Status" IN ('Posted', 'Voided') AND (v_company IS NULL OR e."CompanyId" = v_company)
      AND (p_to IS NULL OR e."Date"::date <= p_to)
    GROUP BY l."AccountId"
  )
  SELECT a."Id", a."Code", a."Name", a."AccountType", a."AccountSubType", a."IsGroup",
         CASE WHEN mv.o_dr - mv.o_cr > 0 THEN mv.o_dr - mv.o_cr ELSE 0 END,
         CASE WHEN mv.o_cr - mv.o_dr > 0 THEN mv.o_cr - mv.o_dr ELSE 0 END,
         mv.p_dr, mv.p_cr,
         CASE WHEN (mv.o_dr + mv.p_dr) - (mv.o_cr + mv.p_cr) > 0 THEN (mv.o_dr + mv.p_dr) - (mv.o_cr + mv.p_cr) ELSE 0 END,
         CASE WHEN (mv.o_cr + mv.p_cr) - (mv.o_dr + mv.p_dr) > 0 THEN (mv.o_cr + mv.p_cr) - (mv.o_dr + mv.p_dr) ELSE 0 END
  FROM "Accounts" a JOIN mv ON mv."AccountId" = a."Id"
  WHERE (v_company IS NULL OR a."CompanyId" = v_company)
  ORDER BY a."Code", a."Name";
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. get_cost_centre_report — spend / income per cost centre with group roll-up
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION accounting.get_cost_centre_report(
  p_company_id   UUID DEFAULT NULL,
  p_dimension_id UUID DEFAULT NULL,
  p_from         DATE DEFAULT NULL,
  p_to           DATE DEFAULT NULL
)
RETURNS TABLE (
  cost_centre_id UUID, dimension_id UUID, dimension_name VARCHAR, code VARCHAR, name VARCHAR,
  parent_id UUID, level INT, is_group BOOLEAN,
  debit NUMERIC, credit NUMERIC, net NUMERIC, line_count BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_company UUID := accounting.resolve_report_company(p_company_id);
BEGIN
  RETURN QUERY
  WITH RECURSIVE cc AS (
    SELECT c."Id", c."DimensionId", c."Code", c."Name", c."ParentId", c."Level", c."IsGroup", c."CompanyId"
    FROM "CostCentres" c
    WHERE (v_company IS NULL OR c."CompanyId" = v_company)
      AND (p_dimension_id IS NULL OR c."DimensionId" = p_dimension_id)
  ), leaf AS (
    SELECT l."CostCentreId" AS id, sum(l."Debit") AS dr, sum(l."Credit") AS cr, count(*) AS n
    FROM "JournalLines" l JOIN "JournalEntries" e ON e."Id" = l."JournalEntryId"
    WHERE e."Status" IN ('Posted', 'Voided') AND l."CostCentreId" IS NOT NULL
      AND (v_company IS NULL OR e."CompanyId" = v_company)
      AND (p_from IS NULL OR e."Date"::date >= p_from)
      AND (p_to   IS NULL OR e."Date"::date <= p_to)
    GROUP BY l."CostCentreId"
  ), anc AS (
    SELECT c."Id" AS node, c."Id" AS self FROM cc c
    UNION ALL
    SELECT anc.node, c."ParentId" FROM anc JOIN cc c ON c."Id" = anc.self WHERE c."ParentId" IS NOT NULL
  )
  SELECT c."Id", c."DimensionId", d."Name", c."Code", c."Name", c."ParentId", c."Level"::int, c."IsGroup",
         COALESCE(sum(leaf.dr), 0), COALESCE(sum(leaf.cr), 0),
         COALESCE(sum(leaf.dr), 0) - COALESCE(sum(leaf.cr), 0), COALESCE(sum(leaf.n), 0)::bigint
  FROM cc c
  JOIN "CostCentreDimensions" d ON d."Id" = c."DimensionId"
  LEFT JOIN anc ON anc.self = c."Id"
  LEFT JOIN leaf ON leaf.id = anc.node
  GROUP BY c."Id", c."DimensionId", d."Name", c."Code", c."Name", c."ParentId", c."Level", c."IsGroup"
  ORDER BY d."Name", c."Code";
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. get_bank_reconciliation_summary — ledger vs statement position for one bank
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION accounting.get_bank_reconciliation_summary(p_bank_account_id UUID, p_as_of DATE DEFAULT CURRENT_DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_ba RECORD;
  v_ledger NUMERIC(18,2);
  v_reconciled NUMERIC(18,2);
  v_unrec_count INT;
  v_stmt RECORD;
BEGIN
  SELECT b."Id", b."Name", b."AccountId", b."CompanyId", b."OpeningBalance", b."Currency" INTO v_ba FROM "BankAccounts" b WHERE b."Id" = p_bank_account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bank account not found.' USING ERRCODE = 'no_data_found'; END IF;

  SELECT COALESCE(sum(l."Debit" - l."Credit"), 0),
         COALESCE(sum(CASE WHEN l."IsReconciled" THEN l."Debit" - l."Credit" ELSE 0 END), 0),
         count(*) FILTER (WHERE NOT l."IsReconciled")
    INTO v_ledger, v_reconciled, v_unrec_count
  FROM "JournalLines" l JOIN "JournalEntries" e ON e."Id" = l."JournalEntryId"
  WHERE l."AccountId" = v_ba."AccountId" AND e."Status" IN ('Posted', 'Voided') AND e."Date"::date <= p_as_of;

  SELECT count(*) AS lines,
         count(*) FILTER (WHERE bl."MatchStatus" = 'Matched')   AS matched,
         count(*) FILTER (WHERE bl."MatchStatus" = 'Suggested') AS suggested,
         count(*) FILTER (WHERE bl."MatchStatus" = 'Unmatched') AS unmatched,
         count(*) FILTER (WHERE bl."MatchStatus" = 'Ignored')   AS ignored,
         COALESCE(sum(bl."Credit" - bl."Debit"), 0) AS statement_net,
         (SELECT s."ClosingBalance" FROM "BankStatements" s WHERE s."BankAccountId" = p_bank_account_id AND s."PeriodTo" <= p_as_of ORDER BY s."PeriodTo" DESC, s."ImportedAt" DESC LIMIT 1) AS last_closing
    INTO v_stmt
  FROM "BankStatementLines" bl WHERE bl."BankAccountId" = p_bank_account_id AND bl."LineDate" <= p_as_of;

  RETURN jsonb_build_object(
    'bankAccountId', v_ba."Id", 'bankAccountName', v_ba."Name", 'glAccountId', v_ba."AccountId", 'currency', v_ba."Currency",
    'asOf', p_as_of,
    'ledgerBalance', v_ledger,
    'reconciledBalance', v_reconciled,
    'unreconciledLedgerLines', v_unrec_count,
    'statementLines', v_stmt.lines, 'matched', v_stmt.matched, 'suggested', v_stmt.suggested,
    'unmatched', v_stmt.unmatched, 'ignored', v_stmt.ignored,
    'statementNetMovement', v_stmt.statement_net,
    'lastStatementClosingBalance', v_stmt.last_closing,
    'difference', CASE WHEN v_stmt.last_closing IS NULL THEN NULL ELSE v_ledger - v_stmt.last_closing END
  );
END;
$$;
