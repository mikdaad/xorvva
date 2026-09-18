-- ============================================================================
-- Xorva Accounting — ported from TrueLedge 00001 §5.6 / §5.7 (cost_centre_dimensions,
-- cost_centres) and the cost_centre_id column on voucher_lines / journal_lines (00003).
-- Script 0002: cost-centre dimensions + cost centres + ledger-line dimension tagging
-- ============================================================================
-- Adaptations from the Supabase original:
--   entity_id                → "TenantId" + "CompanyId"  (Xorva CompanyEntity shape)
--   PG enum dimension_type   → varchar + CHECK           (Xorva stores enums as strings)
--   created_by → auth.users  → "Users"("Id")
--   RLS via has_entity_access→ app.install_company_rls   (script 0001)
-- Column names are PascalCase so EF Core can map these tables with default
-- conventions (the C# entities are thin read models; the DDL here is the truth).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CostCentreDimensions — the TYPES of dimension available to a company
--    ("Project", "Department", "Location", "Activity", …)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CostCentreDimensions" (
  "Id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "TenantId"      UUID NOT NULL,
  "CompanyId"     UUID NOT NULL REFERENCES "Companies"("Id") ON DELETE RESTRICT,
  "DimensionType" VARCHAR(20) NOT NULL DEFAULT 'Custom'
                  CHECK ("DimensionType" IN ('Project','Department','Location','Activity','Segment','Custom')),
  "Name"          VARCHAR(150) NOT NULL,
  "Code"          VARCHAR(20)  NOT NULL,
  "Description"   VARCHAR(500),
  "IsMandatory"   BOOLEAN NOT NULL DEFAULT false,   -- must be selected on every posting line
  "IsActive"      BOOLEAN NOT NULL DEFAULT true,
  "SortOrder"     INT NOT NULL DEFAULT 0,
  "CreatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "UpdatedAt"     TIMESTAMPTZ,
  "CreatedBy"     UUID REFERENCES "Users"("Id") ON DELETE SET NULL,
  "UpdatedBy"     UUID REFERENCES "Users"("Id") ON DELETE SET NULL,

  CONSTRAINT "UQ_CostCentreDimensions_CompanyId_Code" UNIQUE ("CompanyId", "Code")
);

CREATE INDEX IF NOT EXISTS "IX_CostCentreDimensions_CompanyId" ON "CostCentreDimensions" ("CompanyId");

COMMENT ON TABLE "CostCentreDimensions" IS
  'Dimension type definitions for cost centres (ported from TrueLedge). Supports contracting / project reporting.';

-- ----------------------------------------------------------------------------
-- 2. CostCentres — the VALUES within a dimension, hierarchical
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CostCentres" (
  "Id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "TenantId"      UUID NOT NULL,
  "CompanyId"     UUID NOT NULL REFERENCES "Companies"("Id") ON DELETE RESTRICT,
  "DimensionId"   UUID NOT NULL REFERENCES "CostCentreDimensions"("Id") ON DELETE CASCADE,
  "Code"          VARCHAR(30)  NOT NULL,
  "Name"          VARCHAR(150) NOT NULL,
  "ParentId"      UUID REFERENCES "CostCentres"("Id") ON DELETE SET NULL,
  "Level"         SMALLINT NOT NULL DEFAULT 1,
  "IsGroup"       BOOLEAN NOT NULL DEFAULT false,   -- group nodes cannot be posted to
  "IsActive"      BOOLEAN NOT NULL DEFAULT true,
  "Budget"        NUMERIC(18,2),
  "StartDate"     DATE,
  "EndDate"       DATE,
  "CreatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "UpdatedAt"     TIMESTAMPTZ,
  "CreatedBy"     UUID REFERENCES "Users"("Id") ON DELETE SET NULL,
  "UpdatedBy"     UUID REFERENCES "Users"("Id") ON DELETE SET NULL,

  CONSTRAINT "UQ_CostCentres_CompanyId_DimensionId_Code" UNIQUE ("CompanyId", "DimensionId", "Code"),
  CONSTRAINT "CK_CostCentres_Dates" CHECK ("EndDate" IS NULL OR "StartDate" IS NULL OR "EndDate" >= "StartDate")
);

CREATE INDEX IF NOT EXISTS "IX_CostCentres_CompanyId"   ON "CostCentres" ("CompanyId");
CREATE INDEX IF NOT EXISTS "IX_CostCentres_DimensionId" ON "CostCentres" ("DimensionId");
CREATE INDEX IF NOT EXISTS "IX_CostCentres_ParentId"    ON "CostCentres" ("ParentId") WHERE "ParentId" IS NOT NULL;

COMMENT ON TABLE "CostCentres" IS
  'Cost centre values within a dimension. Hierarchical for drill-down reporting (ported from TrueLedge).';

-- ----------------------------------------------------------------------------
-- 3. Tag the single ledger: JournalLines.CostCentreId
-- ----------------------------------------------------------------------------
-- TrueLedge carried cost_centre_id on journal_lines; Xorva's JournalLines is the one
-- ledger, so the column is added there (nullable, additive — payroll / invoices / FX
-- keep posting exactly as before).
ALTER TABLE "JournalLines"
  ADD COLUMN IF NOT EXISTS "CostCentreId" UUID REFERENCES "CostCentres"("Id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "IX_JournalLines_CostCentreId"
  ON "JournalLines" ("CostCentreId") WHERE "CostCentreId" IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. Integrity triggers
-- ----------------------------------------------------------------------------
-- 4a. A cost centre must belong to the same company as the line, must be active,
--     and must not be a group node. (TrueLedge relied on RLS + UI for this; the
--     single-ledger port makes it a DB rule so any module posting through
--     IJournalPoster gets the same guarantee.)
CREATE OR REPLACE FUNCTION accounting.validate_journal_line_cost_centre()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_cc RECORD;
BEGIN
  IF NEW."CostCentreId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "CompanyId", "IsActive", "IsGroup", "Name"
    INTO v_cc
  FROM "CostCentres"
  WHERE "Id" = NEW."CostCentreId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cost centre % does not exist.', NEW."CostCentreId"
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_cc."CompanyId" <> NEW."CompanyId" THEN
    RAISE EXCEPTION 'Cost centre "%" belongs to a different company.', v_cc."Name"
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT v_cc."IsActive" THEN
    RAISE EXCEPTION 'Cost centre "%" is inactive.', v_cc."Name"
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_cc."IsGroup" THEN
    RAISE EXCEPTION 'Cost centre "%" is a group and cannot be posted to.', v_cc."Name"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_lines_cost_centre ON "JournalLines";
CREATE TRIGGER trg_journal_lines_cost_centre
  BEFORE INSERT OR UPDATE OF "CostCentreId" ON "JournalLines"
  FOR EACH ROW EXECUTE FUNCTION accounting.validate_journal_line_cost_centre();

-- 4b. Keep "Level" consistent with the parent (parent level + 1), and forbid
--     cross-dimension / cross-company parents.
CREATE OR REPLACE FUNCTION accounting.set_cost_centre_level()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_parent RECORD;
BEGIN
  IF NEW."ParentId" IS NULL THEN
    NEW."Level" := 1;
    RETURN NEW;
  END IF;

  IF NEW."ParentId" = NEW."Id" THEN
    RAISE EXCEPTION 'A cost centre cannot be its own parent.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT "CompanyId", "DimensionId", "Level" INTO v_parent
  FROM "CostCentres" WHERE "Id" = NEW."ParentId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent cost centre % does not exist.', NEW."ParentId" USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_parent."CompanyId" <> NEW."CompanyId" OR v_parent."DimensionId" <> NEW."DimensionId" THEN
    RAISE EXCEPTION 'Parent cost centre must belong to the same company and dimension.' USING ERRCODE = 'check_violation';
  END IF;

  NEW."Level" := v_parent."Level" + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cost_centres_level ON "CostCentres";
CREATE TRIGGER trg_cost_centres_level
  BEFORE INSERT OR UPDATE OF "ParentId", "DimensionId", "CompanyId" ON "CostCentres"
  FOR EACH ROW EXECUTE FUNCTION accounting.set_cost_centre_level();

-- 4c. Deleting a cost centre with posted lines is blocked (mirror of TrueLedge's
--     prevent_account_delete philosophy: deactivate, never lose history).
CREATE OR REPLACE FUNCTION accounting.prevent_cost_centre_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_lines BIGINT;
BEGIN
  SELECT count(*) INTO v_lines FROM "JournalLines" WHERE "CostCentreId" = OLD."Id";
  IF v_lines > 0 THEN
    RAISE EXCEPTION 'Cost centre "%" has % posted line(s) and cannot be deleted. Deactivate it instead.',
      OLD."Name", v_lines USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cost_centres_prevent_delete ON "CostCentres";
CREATE TRIGGER trg_cost_centres_prevent_delete
  BEFORE DELETE ON "CostCentres"
  FOR EACH ROW EXECUTE FUNCTION accounting.prevent_cost_centre_delete();

-- ----------------------------------------------------------------------------
-- 5. Audit + RLS
-- ----------------------------------------------------------------------------
SELECT app.install_audit_trigger('"CostCentreDimensions"');
SELECT app.install_audit_trigger('"CostCentres"');
SELECT app.install_company_rls('"CostCentreDimensions"');
SELECT app.install_company_rls('"CostCentres"');

-- ----------------------------------------------------------------------------
-- 6. Read helpers used by the API / reports
-- ----------------------------------------------------------------------------
-- Cost-centre balance: the sum of posted lines tagged with the centre (and,
-- for a group node, all of its descendants) — computed from the ledger, never cached.
CREATE OR REPLACE FUNCTION accounting.cost_centre_balance(
  p_cost_centre_id UUID,
  p_from DATE DEFAULT NULL,
  p_to   DATE DEFAULT NULL
)
RETURNS TABLE (debit NUMERIC(18,2), credit NUMERIC(18,2), net NUMERIC(18,2))
LANGUAGE sql
STABLE
AS $$
  WITH RECURSIVE tree AS (
    SELECT "Id" FROM "CostCentres" WHERE "Id" = p_cost_centre_id
    UNION ALL
    SELECT c."Id" FROM "CostCentres" c JOIN tree t ON c."ParentId" = t."Id"
  )
  SELECT
    COALESCE(sum(l."Debit"), 0)::numeric(18,2),
    COALESCE(sum(l."Credit"), 0)::numeric(18,2),
    (COALESCE(sum(l."Debit"), 0) - COALESCE(sum(l."Credit"), 0))::numeric(18,2)
  FROM "JournalLines" l
  JOIN "JournalEntries" e ON e."Id" = l."JournalEntryId"
  WHERE l."CostCentreId" IN (SELECT "Id" FROM tree)
    AND e."Status" IN ('Posted', 'Voided')
    AND (p_from IS NULL OR e."Date"::date >= p_from)
    AND (p_to   IS NULL OR e."Date"::date <= p_to);
$$;
