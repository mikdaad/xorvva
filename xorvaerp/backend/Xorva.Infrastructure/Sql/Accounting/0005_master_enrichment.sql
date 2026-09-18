-- ============================================================================
-- Xorva Accounting — ported from TrueLedge 00001 (accounts / parties / items /
-- tax_codes / periods) + 00006 (Tally-style entity defaults, account extras).
-- Script 0005: master-data enrichment + soft/hard period close
-- ============================================================================
-- Everything here is ADDITIVE to Xorva's existing master tables (Accounts,
-- Contacts, Products, TaxRates, FiscalPeriods, AccountingSettings). No column is
-- renamed, retyped or dropped, so the existing EF entities and the base-currency
-- posting path keep working untouched; the new columns are nullable or defaulted.
--
-- Deliberately NOT ported:
--   * accounts.opening_balance / opening_balance_type — Xorva already posts opening
--     balances as a ledger entry (PostOpeningBalances, SourceType 'Opening'). A second
--     copy on the account row would be a competing source of truth.
--   * account_balances materialised table — Accounts.CurrentBalance is Xorva's cache,
--     and report RPCs (script 0007) aggregate JournalLines directly.
--   * uq_account_entity_name (unique lower(name)) — existing Xorva charts may contain
--     duplicate names; enforcing it retroactively could break the migration.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Accounts — Tally ledger attributes
-- ----------------------------------------------------------------------------
ALTER TABLE "Accounts"
  ADD COLUMN IF NOT EXISTS "NameAr"           VARCHAR(150),
  ADD COLUMN IF NOT EXISTS "IsGroup"          BOOLEAN NOT NULL DEFAULT false,   -- group ledgers cannot be posted to
  ADD COLUMN IF NOT EXISTS "IsControl"        BOOLEAN NOT NULL DEFAULT false,   -- AR/AP control (sub-ledger backed)
  ADD COLUMN IF NOT EXISTS "IsBank"           BOOLEAN NOT NULL DEFAULT false,   -- reconcilable bank ledger
  ADD COLUMN IF NOT EXISTS "PartyTrn"         VARCHAR(15),
  ADD COLUMN IF NOT EXISTS "PlaceOfSupply"    VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "DefaultTaxRateId" UUID REFERENCES "TaxRates"("Id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "IX_Accounts_CompanyId_ParentAccountId" ON "Accounts" ("CompanyId", "ParentAccountId");

-- One-time backfill from Xorva's own classification (idempotent: only flips false→true).
UPDATE "Accounts" SET "IsBank" = true
 WHERE NOT "IsBank" AND "AccountSubType" = 'Bank';
UPDATE "Accounts" SET "IsControl" = true
 WHERE NOT "IsControl" AND "AccountSubType" IN ('AccountsReceivable', 'AccountsPayable');

-- Keep the flags coherent for rows created by the EF path (which does not know the
-- Tally semantics): a 'Bank' sub-type IS a bank ledger, AR/AP sub-types ARE control accounts.
CREATE OR REPLACE FUNCTION accounting.derive_account_flags()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."AccountSubType" = 'Bank' THEN NEW."IsBank" := true; END IF;
  IF NEW."AccountSubType" IN ('AccountsReceivable', 'AccountsPayable') THEN NEW."IsControl" := true; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_accounts_derive_flags ON "Accounts";
CREATE TRIGGER trg_accounts_derive_flags
  BEFORE INSERT OR UPDATE OF "AccountSubType" ON "Accounts"
  FOR EACH ROW EXECUTE FUNCTION accounting.derive_account_flags();

-- Guard: nothing may post to a group ledger — covers both the RPC and the EF path.
CREATE OR REPLACE FUNCTION accounting.prevent_group_account_posting()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_acct RECORD;
BEGIN
  SELECT "Name", "IsGroup" INTO v_acct FROM "Accounts" WHERE "Id" = NEW."AccountId";
  IF FOUND AND v_acct."IsGroup" THEN
    RAISE EXCEPTION 'Ledger "%" is a group and cannot be posted to. Select a ledger under it.', v_acct."Name"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_lines_no_group_posting ON "JournalLines";
CREATE TRIGGER trg_journal_lines_no_group_posting
  BEFORE INSERT ON "JournalLines"
  FOR EACH ROW EXECUTE FUNCTION accounting.prevent_group_account_posting();

-- Guard: an account that already has ledger lines cannot become a group; a parent
-- must be in the same company; an account cannot be its own parent.
CREATE OR REPLACE FUNCTION accounting.validate_account_hierarchy()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_parent_company UUID;
BEGIN
  IF NEW."IsGroup" AND (TG_OP = 'INSERT' OR NOT OLD."IsGroup") THEN
    IF EXISTS (SELECT 1 FROM "JournalLines" WHERE "AccountId" = NEW."Id") THEN
      RAISE EXCEPTION 'Ledger "%" has journal lines and cannot be converted to a group.', NEW."Name"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW."ParentAccountId" IS NOT NULL THEN
    IF NEW."ParentAccountId" = NEW."Id" THEN
      RAISE EXCEPTION 'An account cannot be its own parent.' USING ERRCODE = 'check_violation';
    END IF;
    SELECT "CompanyId" INTO v_parent_company FROM "Accounts" WHERE "Id" = NEW."ParentAccountId";
    IF v_parent_company IS DISTINCT FROM NEW."CompanyId" THEN
      RAISE EXCEPTION 'Parent account must belong to the same company.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_accounts_hierarchy ON "Accounts";
CREATE TRIGGER trg_accounts_hierarchy
  BEFORE INSERT OR UPDATE OF "IsGroup", "ParentAccountId", "CompanyId" ON "Accounts"
  FOR EACH ROW EXECUTE FUNCTION accounting.validate_account_hierarchy();

-- ----------------------------------------------------------------------------
-- 2. Contacts — UAE tax treatment, control account, credit terms, address
-- ----------------------------------------------------------------------------
ALTER TABLE "Contacts"
  ADD COLUMN IF NOT EXISTS "NameAr"           VARCHAR(150),
  ADD COLUMN IF NOT EXISTS "TaxTreatment"     VARCHAR(20) NOT NULL DEFAULT 'Registered',
  ADD COLUMN IF NOT EXISTS "ControlAccountId" UUID REFERENCES "Accounts"("Id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "DefaultTaxRateId" UUID REFERENCES "TaxRates"("Id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "CreditLimit"      NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ContactPerson"    VARCHAR(150),
  ADD COLUMN IF NOT EXISTS "AddressLine1"     VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "AddressLine2"     VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "City"             VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "Country"          VARCHAR(2) NOT NULL DEFAULT 'AE';

ALTER TABLE "Contacts" DROP CONSTRAINT IF EXISTS "CK_Contacts_TaxTreatment";
ALTER TABLE "Contacts" ADD CONSTRAINT "CK_Contacts_TaxTreatment"
  CHECK ("TaxTreatment" IN ('Registered','Unregistered','DesignatedZone','Exempt','ReverseCharge'));
ALTER TABLE "Contacts" DROP CONSTRAINT IF EXISTS "CK_Contacts_CreditLimit";
ALTER TABLE "Contacts" ADD CONSTRAINT "CK_Contacts_CreditLimit" CHECK ("CreditLimit" >= 0);

-- A registered counter-party must carry a TRN once we start issuing tax invoices;
-- enforced softly (warning-level) in the UI, hard-enforced here only for the
-- Registered ⇢ TRN format rule: 15 digits when present.
ALTER TABLE "Contacts" DROP CONSTRAINT IF EXISTS "CK_Contacts_TrnFormat";
ALTER TABLE "Contacts" ADD CONSTRAINT "CK_Contacts_TrnFormat"
  CHECK ("TaxNumber" IS NULL OR "TaxNumber" = '' OR "Country" <> 'AE' OR "TaxNumber" ~ '^[0-9]{15}$') NOT VALID;
  -- NOT VALID: existing rows are not re-checked; new/updated rows are.

-- ----------------------------------------------------------------------------
-- 3. Products — purchase side, UoM, item type, HSN
-- ----------------------------------------------------------------------------
ALTER TABLE "Products"
  ADD COLUMN IF NOT EXISTS "NameAr"            VARCHAR(150),
  ADD COLUMN IF NOT EXISTS "ItemType"          VARCHAR(20) NOT NULL DEFAULT 'Service',
  ADD COLUMN IF NOT EXISTS "UnitOfMeasure"     VARCHAR(20) NOT NULL DEFAULT 'EA',
  ADD COLUMN IF NOT EXISTS "PurchaseAccountId" UUID REFERENCES "Accounts"("Id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "PurchasePrice"     NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS "PurchaseTaxRateId" UUID REFERENCES "TaxRates"("Id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "HsnCode"           VARCHAR(20);

ALTER TABLE "Products" DROP CONSTRAINT IF EXISTS "CK_Products_ItemType";
ALTER TABLE "Products" ADD CONSTRAINT "CK_Products_ItemType"
  CHECK ("ItemType" IN ('Inventory','Service','Expense','FixedAsset'));

-- ----------------------------------------------------------------------------
-- 4. TaxRates — code, FTA mapping, scope, default flag
-- ----------------------------------------------------------------------------
ALTER TABLE "TaxRates"
  ADD COLUMN IF NOT EXISTS "Code"      VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "TaxScope"  VARCHAR(20) NOT NULL DEFAULT 'VAT',
  ADD COLUMN IF NOT EXISTS "FtaCode"   VARCHAR(20),     -- VAT return box / e-invoicing category (e.g. SR, ZR, EX, RC, OS)
  ADD COLUMN IF NOT EXISTS "IsDefault" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "TaxRates" DROP CONSTRAINT IF EXISTS "CK_TaxRates_TaxScope";
ALTER TABLE "TaxRates" ADD CONSTRAINT "CK_TaxRates_TaxScope"
  CHECK ("TaxScope" IN ('VAT','CorporateTax','Excise','Withholding'));
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_TaxRates_CompanyId_Code" ON "TaxRates" ("CompanyId", "Code") WHERE "Code" IS NOT NULL;
-- at most one default per company per scope
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_TaxRates_CompanyId_Default" ON "TaxRates" ("CompanyId", "TaxScope") WHERE "IsDefault";

-- Backfill FTA codes for the standard UAE set Xorva seeds (names are stable in ChartTemplates/DbInitializer).
UPDATE "TaxRates" SET "FtaCode" = CASE
    WHEN "Rate" = 5  THEN 'SR'
    WHEN "Rate" = 0 AND "Name" ILIKE '%zero%'   THEN 'ZR'
    WHEN "Rate" = 0 AND "Name" ILIKE '%exempt%' THEN 'EX'
    WHEN "Name" ILIKE '%reverse%' THEN 'RC'
    WHEN "Name" ILIKE '%out of scope%' OR "Name" ILIKE '%outofscope%' THEN 'OS'
  END
 WHERE "FtaCode" IS NULL;

-- ----------------------------------------------------------------------------
-- 5. AccountingSettings — Tally "company defaults" (TrueLedge 00006 §1)
-- ----------------------------------------------------------------------------
ALTER TABLE "AccountingSettings"
  ADD COLUMN IF NOT EXISTS "MailingName"      VARCHAR(200),   -- name printed on invoices/statements
  ADD COLUMN IF NOT EXISTS "CorporateTaxTrn"  VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "IsFreeZone"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "FreeZoneName"     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "BooksBeginDate"   DATE,
  ADD COLUMN IF NOT EXISTS "DecimalPlaces"    SMALLINT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS "CoaTemplate"      VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "DefaultCostCentreDimensionId" UUID REFERENCES "CostCentreDimensions"("Id") ON DELETE SET NULL;

ALTER TABLE "AccountingSettings" DROP CONSTRAINT IF EXISTS "CK_AccountingSettings_DecimalPlaces";
ALTER TABLE "AccountingSettings" ADD CONSTRAINT "CK_AccountingSettings_DecimalPlaces" CHECK ("DecimalPlaces" IN (2, 4));

UPDATE "AccountingSettings" s
   SET "MailingName" = COALESCE(s."MailingName", s."LegalName", c."Name")
  FROM "Companies" c
 WHERE c."Id" = s."CompanyId" AND s."MailingName" IS NULL;

UPDATE "AccountingSettings" s
   SET "BooksBeginDate" = fy.start_date
  FROM (SELECT "CompanyId", min("StartDate")::date AS start_date FROM "FiscalYears" GROUP BY "CompanyId") fy
 WHERE fy."CompanyId" = s."CompanyId" AND s."BooksBeginDate" IS NULL;

-- ----------------------------------------------------------------------------
-- 6. FiscalPeriods — soft / hard close (TrueLedge period_status)
-- ----------------------------------------------------------------------------
-- Xorva's boolean IsClosed stays the flag PeriodGuard.cs reads. CloseStatus refines it:
--   Open        → anyone with posting rights
--   SoftClosed  → only CompanyAdmin and above (role ≤ 2) may still post adjustments
--                 through the SQL posting path; IsClosed = true so the C# path stays
--                 conservative (denies everyone) until PeriodGuard learns roles.
--   HardClosed  → nobody. Reopening requires an explicit status change.
-- The two columns are kept in sync both ways by a trigger, so EF code that only
-- flips IsClosed keeps working.
ALTER TABLE "FiscalPeriods"
  ADD COLUMN IF NOT EXISTS "CloseStatus" VARCHAR(12) NOT NULL DEFAULT 'Open',
  ADD COLUMN IF NOT EXISTS "ClosedAt"    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "ClosedBy"    UUID REFERENCES "Users"("Id") ON DELETE SET NULL;

ALTER TABLE "FiscalPeriods" DROP CONSTRAINT IF EXISTS "CK_FiscalPeriods_CloseStatus";
ALTER TABLE "FiscalPeriods" ADD CONSTRAINT "CK_FiscalPeriods_CloseStatus"
  CHECK ("CloseStatus" IN ('Open','SoftClosed','HardClosed'));

UPDATE "FiscalPeriods" SET "CloseStatus" = 'HardClosed' WHERE "IsClosed" AND "CloseStatus" = 'Open';

CREATE OR REPLACE FUNCTION accounting.sync_period_close_flags()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."CloseStatus" <> 'Open' THEN
      NEW."IsClosed" := true;
    ELSIF NEW."IsClosed" THEN
      NEW."CloseStatus" := 'HardClosed';
    END IF;
  ELSE
    IF NEW."CloseStatus" IS DISTINCT FROM OLD."CloseStatus" THEN
      NEW."IsClosed" := NEW."CloseStatus" <> 'Open';                -- status drives the flag
    ELSIF NEW."IsClosed" IS DISTINCT FROM OLD."IsClosed" THEN
      NEW."CloseStatus" := CASE WHEN NEW."IsClosed" THEN 'HardClosed' ELSE 'Open' END;   -- EF flag drives status
    END IF;
  END IF;
  IF NEW."IsClosed" AND (TG_OP = 'INSERT' OR NOT OLD."IsClosed" OR NEW."CloseStatus" IS DISTINCT FROM OLD."CloseStatus") THEN
    NEW."ClosedAt" := now();
    NEW."ClosedBy" := COALESCE(app.current_user_id(), NEW."ClosedBy");
  ELSIF NOT NEW."IsClosed" THEN
    NEW."ClosedAt" := NULL;
    NEW."ClosedBy" := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fiscal_periods_close_sync ON "FiscalPeriods";
CREATE TRIGGER trg_fiscal_periods_close_sync
  BEFORE INSERT OR UPDATE OF "IsClosed", "CloseStatus" ON "FiscalPeriods"
  FOR EACH ROW EXECUTE FUNCTION accounting.sync_period_close_flags();

-- Replace the 0003 gate with status-aware semantics (same signature; both the
-- JournalEntries trigger and post_voucher_atomic call it).
CREATE OR REPLACE FUNCTION accounting.assert_period_open(p_period_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_period RECORD;
BEGIN
  IF p_period_id IS NULL THEN RETURN; END IF;     -- no period covers the date → permissive (PeriodGuard parity)
  SELECT "Name", "IsClosed", "CloseStatus" INTO v_period FROM "FiscalPeriods" WHERE "Id" = p_period_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_period."CloseStatus" = 'HardClosed' THEN
    RAISE EXCEPTION 'The accounting period ''%'' is closed — post into an open period.', v_period."Name"
      USING ERRCODE = 'check_violation';
  ELSIF v_period."CloseStatus" = 'SoftClosed' OR v_period."IsClosed" THEN
    IF app.current_role_value() > 2 THEN     -- Manager / Employee
      RAISE EXCEPTION 'The accounting period ''%'' is soft-closed — only a company administrator can post adjustments to it.', v_period."Name"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
END;
$$;

-- RPC used by the periods screen. p_status: Open | SoftClosed | HardClosed.
-- Hard-closing requires every earlier period of the same fiscal year to be at least soft-closed.
CREATE OR REPLACE FUNCTION accounting.set_period_close_status(p_period_id UUID, p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_period RECORD;
BEGIN
  IF app.current_role_value() > 2 THEN
    RAISE EXCEPTION 'Only a company administrator can open or close accounting periods.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_period FROM "FiscalPeriods" WHERE "Id" = p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Period not found.' USING ERRCODE = 'no_data_found'; END IF;

  IF p_status = 'HardClosed' AND EXISTS (
      SELECT 1 FROM "FiscalPeriods" p
      WHERE p."FiscalYearId" = v_period."FiscalYearId" AND p."StartDate" < v_period."StartDate" AND p."CloseStatus" = 'Open') THEN
    RAISE EXCEPTION 'Close the earlier periods of this fiscal year before hard-closing ''%''.', v_period."Name"
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE "FiscalPeriods" SET "CloseStatus" = p_status, "UpdatedAt" = now(), "UpdatedBy" = app.current_user_id()
   WHERE "Id" = p_period_id;
END;
$$;
