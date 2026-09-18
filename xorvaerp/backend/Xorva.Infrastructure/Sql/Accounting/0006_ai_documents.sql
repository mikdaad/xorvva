-- ============================================================================
-- Xorva Accounting — ported from TrueLedge 00005 (documents, extractions,
-- ai_suggestions) + actions/inbox.ts (uploadDocument / extractDocument lifecycle).
-- Script 0006: AI document inbox — upload → Gemini extraction → review → voucher
-- ============================================================================
-- Principle carried over verbatim from TrueLedge: the AI NEVER posts. It produces an
-- extraction with per-field confidence; a human accepts it, which creates a Draft
-- voucher through the normal path. Everything the model returned is stored for audit.
--
-- Adaptations:
--   * Supabase Storage URL → bytes in "AccountingDocumentFiles" (bytea), mirroring
--     Xorva's HrFiles pattern (the HR module's table is not reused — modules must not
--     reference each other). The file row is separate from the document row so list
--     queries never pull the blob.
--   * entity_id → TenantId + CompanyId; PG enum → varchar + CHECK; auth.users → "Users".
--   * The multi-step status dance in inbox.ts becomes three RPCs so the .NET handler
--     can't leave a document half-updated: begin_document_extraction,
--     complete_document_extraction (writes extraction + suggestions atomically),
--     fail_document_extraction. accept_document_extraction links the created voucher.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. AccountingDocumentFiles — the bytes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "AccountingDocumentFiles" (
  "Id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "TenantId"    UUID NOT NULL,
  "CompanyId"   UUID NOT NULL REFERENCES "Companies"("Id") ON DELETE RESTRICT,
  "FileName"    VARCHAR(260) NOT NULL,
  "ContentType" VARCHAR(120) NOT NULL,
  "Size"        BIGINT NOT NULL,
  "Sha256"      CHAR(64),
  "Data"        BYTEA NOT NULL,
  "CreatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "UpdatedAt"   TIMESTAMPTZ,
  "CreatedBy"   UUID REFERENCES "Users"("Id") ON DELETE SET NULL,
  "UpdatedBy"   UUID REFERENCES "Users"("Id") ON DELETE SET NULL,
  CONSTRAINT "CK_AccountingDocumentFiles_Size" CHECK ("Size" > 0 AND "Size" <= 20 * 1024 * 1024)   -- 20 MB, matches Gemini inline limit
);
CREATE INDEX IF NOT EXISTS "IX_AccountingDocumentFiles_CompanyId" ON "AccountingDocumentFiles" ("CompanyId");

-- ----------------------------------------------------------------------------
-- 2. AccountingDocuments — lifecycle
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "AccountingDocuments" (
  "Id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "TenantId"         UUID NOT NULL,
  "CompanyId"        UUID NOT NULL REFERENCES "Companies"("Id") ON DELETE RESTRICT,
  "FileId"           UUID NOT NULL REFERENCES "AccountingDocumentFiles"("Id") ON DELETE RESTRICT,

  "FileName"         VARCHAR(260) NOT NULL,
  "MimeType"         VARCHAR(120) NOT NULL,
  "FileSize"         BIGINT,
  "PageCount"        INT,
  "Tags"             TEXT[],

  "Status"           VARCHAR(20) NOT NULL DEFAULT 'Pending'
                     CHECK ("Status" IN ('Pending','Processing','Extracted','Accepted','Rejected','Failed')),
  "StatusMessage"    VARCHAR(1000),
  "DocumentKind"     VARCHAR(20) NOT NULL DEFAULT 'PurchaseInvoice'
                     CHECK ("DocumentKind" IN ('PurchaseInvoice','SalesInvoice','Receipt','Other')),

  "CreatedVoucherId" UUID REFERENCES "Vouchers"("Id") ON DELETE SET NULL,   -- set when accepted

  "UploadedAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "UploadedBy"       UUID REFERENCES "Users"("Id") ON DELETE SET NULL,
  "ProcessedAt"      TIMESTAMPTZ,

  "CreatedAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "UpdatedAt"        TIMESTAMPTZ,
  "CreatedBy"        UUID REFERENCES "Users"("Id") ON DELETE SET NULL,
  "UpdatedBy"        UUID REFERENCES "Users"("Id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "IX_AccountingDocuments_CompanyId_Status" ON "AccountingDocuments" ("CompanyId", "Status");
CREATE INDEX IF NOT EXISTS "IX_AccountingDocuments_UploadedAt"       ON "AccountingDocuments" ("UploadedAt" DESC);
CREATE INDEX IF NOT EXISTS "IX_AccountingDocuments_CreatedVoucherId" ON "AccountingDocuments" ("CreatedVoucherId") WHERE "CreatedVoucherId" IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. DocumentExtractions — one row per model run (re-extraction keeps history)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "DocumentExtractions" (
  "Id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "TenantId"         UUID NOT NULL,
  "CompanyId"        UUID NOT NULL REFERENCES "Companies"("Id") ON DELETE RESTRICT,
  "DocumentId"       UUID NOT NULL REFERENCES "AccountingDocuments"("Id") ON DELETE CASCADE,

  "ModelUsed"        VARCHAR(60) NOT NULL DEFAULT 'gemini-2.5-flash',
  "ModelVersion"     VARCHAR(60),
  "ProcessingTimeMs" INT,

  "RawResponse"      JSONB,                 -- full API response for audit
  "ExtractedData"    JSONB NOT NULL,        -- ExtractedInvoice shape (gemini.ts)
  "ConfidenceScore"  NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK ("ConfidenceScore" BETWEEN 0 AND 1),

  "CreatedVoucherId" UUID REFERENCES "Vouchers"("Id") ON DELETE SET NULL,
  "IsAccepted"       BOOLEAN NOT NULL DEFAULT false,
  "AcceptedAt"       TIMESTAMPTZ,
  "AcceptedBy"       UUID REFERENCES "Users"("Id") ON DELETE SET NULL,

  "CreatedAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "UpdatedAt"        TIMESTAMPTZ,
  "CreatedBy"        UUID REFERENCES "Users"("Id") ON DELETE SET NULL,
  "UpdatedBy"        UUID REFERENCES "Users"("Id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "IX_DocumentExtractions_DocumentId" ON "DocumentExtractions" ("DocumentId", "CreatedAt" DESC);
CREATE INDEX IF NOT EXISTS "IX_DocumentExtractions_CompanyId"  ON "DocumentExtractions" ("CompanyId");

-- ----------------------------------------------------------------------------
-- 4. DocumentFieldSuggestions — per-field confidence + user override
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "DocumentFieldSuggestions" (
  "Id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "TenantId"       UUID NOT NULL,
  "CompanyId"      UUID NOT NULL REFERENCES "Companies"("Id") ON DELETE RESTRICT,
  "ExtractionId"   UUID NOT NULL REFERENCES "DocumentExtractions"("Id") ON DELETE CASCADE,
  "FieldName"      VARCHAR(100) NOT NULL,   -- 'supplier_name', 'line_items[0].amount' …
  "FieldGroup"     VARCHAR(20)  CHECK ("FieldGroup" IS NULL OR "FieldGroup" IN ('header','line_item','totals')),
  "ExtractedValue" TEXT,
  "Confidence"     NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK ("Confidence" BETWEEN 0 AND 1),
  "UserOverride"   TEXT,
  "FinalValue"     TEXT,
  "CreatedAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "UpdatedAt"      TIMESTAMPTZ,
  "CreatedBy"      UUID REFERENCES "Users"("Id") ON DELETE SET NULL,
  "UpdatedBy"      UUID REFERENCES "Users"("Id") ON DELETE SET NULL,
  CONSTRAINT "UQ_DocumentFieldSuggestions_Extraction_Field" UNIQUE ("ExtractionId", "FieldName")
);
CREATE INDEX IF NOT EXISTS "IX_DocumentFieldSuggestions_CompanyId" ON "DocumentFieldSuggestions" ("CompanyId");

-- FinalValue always resolves override ?? extracted (TrueLedge kept this in app code).
CREATE OR REPLACE FUNCTION accounting.resolve_suggestion_final_value()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."FinalValue" := COALESCE(NEW."UserOverride", NEW."ExtractedValue");
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_document_field_suggestions_final ON "DocumentFieldSuggestions";
CREATE TRIGGER trg_document_field_suggestions_final
  BEFORE INSERT OR UPDATE OF "UserOverride", "ExtractedValue" ON "DocumentFieldSuggestions"
  FOR EACH ROW EXECUTE FUNCTION accounting.resolve_suggestion_final_value();

-- ----------------------------------------------------------------------------
-- 5. Status machine (document)
-- ----------------------------------------------------------------------------
--   Pending → Processing → Extracted → Accepted | Rejected
--   Processing → Failed → Processing (retry)
--   Extracted → Processing (re-extract)
--   Accepted is terminal.
CREATE OR REPLACE FUNCTION accounting.enforce_document_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."Status" = OLD."Status" THEN RETURN NEW; END IF;
  IF OLD."Status" = 'Accepted' THEN
    RAISE EXCEPTION 'An accepted document cannot change status.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT (
       (OLD."Status" = 'Pending'    AND NEW."Status" IN ('Processing','Rejected'))
    OR (OLD."Status" = 'Processing' AND NEW."Status" IN ('Extracted','Failed'))
    OR (OLD."Status" = 'Failed'     AND NEW."Status" IN ('Processing','Rejected'))
    OR (OLD."Status" = 'Extracted'  AND NEW."Status" IN ('Accepted','Rejected','Processing'))
    OR (OLD."Status" = 'Rejected'   AND NEW."Status" = 'Processing')
  ) THEN
    RAISE EXCEPTION 'Invalid document status transition % → %.', OLD."Status", NEW."Status" USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."Status" = 'Accepted' AND NEW."CreatedVoucherId" IS NULL THEN
    RAISE EXCEPTION 'A document can only be accepted together with the voucher it created.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_accounting_documents_status ON "AccountingDocuments";
CREATE TRIGGER trg_accounting_documents_status
  BEFORE UPDATE OF "Status" ON "AccountingDocuments"
  FOR EACH ROW EXECUTE FUNCTION accounting.enforce_document_status();

-- ----------------------------------------------------------------------------
-- 6. RPCs — the inbox.ts lifecycle, made atomic
-- ----------------------------------------------------------------------------
-- upload: bytes + document row in one call. Returns document id.
CREATE OR REPLACE FUNCTION accounting.upload_document(
  p_company_id    UUID,
  p_file_name     TEXT,
  p_content_type  TEXT,
  p_data          BYTEA,
  p_document_kind TEXT DEFAULT 'PurchaseInvoice',
  p_tags          TEXT[] DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant  UUID;
  v_user    UUID := app.current_user_id();
  v_file_id UUID := gen_random_uuid();
  v_doc_id  UUID := gen_random_uuid();
BEGIN
  SELECT "TenantId" INTO v_tenant FROM "Companies" WHERE "Id" = p_company_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Company not found.' USING ERRCODE = 'no_data_found'; END IF;
  IF p_content_type NOT IN ('application/pdf','image/jpeg','image/png','image/webp','image/heic') THEN
    RAISE EXCEPTION 'Unsupported file type %. Upload a PDF or an image (JPEG, PNG, WEBP, HEIC).', p_content_type USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO "AccountingDocumentFiles" ("Id","TenantId","CompanyId","FileName","ContentType","Size","Sha256","Data","CreatedBy")
  VALUES (v_file_id, v_tenant, p_company_id, p_file_name, p_content_type, octet_length(p_data), encode(sha256(p_data), 'hex'), p_data, v_user);

  INSERT INTO "AccountingDocuments" ("Id","TenantId","CompanyId","FileId","FileName","MimeType","FileSize","Tags","DocumentKind","UploadedBy","CreatedBy")
  VALUES (v_doc_id, v_tenant, p_company_id, v_file_id, p_file_name, p_content_type, octet_length(p_data), p_tags, p_document_kind, v_user, v_user);

  RETURN v_doc_id;
END;
$$;

-- Claims the document for extraction (Pending/Failed/Extracted/Rejected → Processing).
-- Returns the file bytes + mime type so the caller can send them to Gemini.
CREATE OR REPLACE FUNCTION accounting.begin_document_extraction(p_document_id UUID)
RETURNS TABLE (mime_type TEXT, data BYTEA, document_kind TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_doc RECORD;
BEGIN
  SELECT * INTO v_doc FROM "AccountingDocuments" WHERE "Id" = p_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found.' USING ERRCODE = 'no_data_found'; END IF;
  IF v_doc."Status" = 'Processing' THEN
    RAISE EXCEPTION 'This document is already being processed.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE "AccountingDocuments" SET "Status" = 'Processing', "StatusMessage" = NULL WHERE "Id" = p_document_id;
  RETURN QUERY
    SELECT f."ContentType"::text, f."Data", v_doc."DocumentKind"::text
    FROM "AccountingDocumentFiles" f WHERE f."Id" = v_doc."FileId";
END;
$$;

-- Stores the model output + per-field suggestions and flips the document to Extracted.
-- p_extracted must follow the ExtractedInvoice shape (gemini.ts): supplier_name, supplier_trn,
-- buyer_name, buyer_trn, invoice_number, invoice_date, due_date, currency, place_of_supply,
-- line_items[{description, quantity, unit_price, tax_rate, amount, confidence, matched_item_id,
-- matched_account_id}], subtotal, tax_total, grand_total, overall_confidence,
-- field_confidence{...}, matched_party_id.
CREATE OR REPLACE FUNCTION accounting.complete_document_extraction(
  p_document_id        UUID,
  p_extracted          JSONB,
  p_raw_response       JSONB DEFAULT NULL,
  p_model_used         TEXT DEFAULT 'gemini-2.5-flash',
  p_model_version      TEXT DEFAULT NULL,
  p_processing_time_ms INT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_doc    RECORD;
  v_ext_id UUID := gen_random_uuid();
  v_user   UUID := app.current_user_id();
  v_conf   NUMERIC := LEAST(1, GREATEST(0, COALESCE((p_extracted->>'overall_confidence')::numeric, 0)));
  v_fc     JSONB := COALESCE(p_extracted->'field_confidence', '{}'::jsonb);
  v_item   JSONB;
  v_idx    INT := 0;
BEGIN
  SELECT * INTO v_doc FROM "AccountingDocuments" WHERE "Id" = p_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found.' USING ERRCODE = 'no_data_found'; END IF;
  IF v_doc."Status" <> 'Processing' THEN
    RAISE EXCEPTION 'Document is not being processed (status %).', v_doc."Status" USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO "DocumentExtractions" ("Id","TenantId","CompanyId","DocumentId","ModelUsed","ModelVersion","ProcessingTimeMs","RawResponse","ExtractedData","ConfidenceScore","CreatedBy")
  VALUES (v_ext_id, v_doc."TenantId", v_doc."CompanyId", p_document_id, p_model_used, p_model_version, p_processing_time_ms, p_raw_response, p_extracted, v_conf, v_user);

  -- header + totals (same list as inbox.ts §7)
  INSERT INTO "DocumentFieldSuggestions" ("TenantId","CompanyId","ExtractionId","FieldName","FieldGroup","ExtractedValue","Confidence","CreatedBy")
  SELECT v_doc."TenantId", v_doc."CompanyId", v_ext_id, f.name, f.grp, p_extracted->>f.name,
         LEAST(1, GREATEST(0, COALESCE((v_fc->>f.conf_key)::numeric, v_conf))), v_user
  FROM (VALUES
    ('supplier_name',  'header', 'supplier_name'),
    ('supplier_trn',   'header', 'supplier_trn'),
    ('buyer_name',     'header', 'buyer_name'),
    ('buyer_trn',      'header', 'buyer_trn'),
    ('invoice_number', 'header', 'invoice_number'),
    ('invoice_date',   'header', 'invoice_date'),
    ('due_date',       'header', 'due_date'),
    ('currency',       'header', 'currency'),
    ('place_of_supply','header', 'place_of_supply'),
    ('subtotal',       'totals', 'totals'),
    ('tax_total',      'totals', 'totals'),
    ('grand_total',    'totals', 'totals')
  ) AS f(name, grp, conf_key);

  -- line items
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_extracted->'line_items', '[]'::jsonb)) LOOP
    INSERT INTO "DocumentFieldSuggestions" ("TenantId","CompanyId","ExtractionId","FieldName","FieldGroup","ExtractedValue","Confidence","CreatedBy")
    VALUES
      (v_doc."TenantId", v_doc."CompanyId", v_ext_id, format('line_items[%s].description', v_idx), 'line_item', v_item->>'description',
       LEAST(1, GREATEST(0, COALESCE((v_item->>'confidence')::numeric, v_conf))), v_user),
      (v_doc."TenantId", v_doc."CompanyId", v_ext_id, format('line_items[%s].amount', v_idx), 'line_item', v_item->>'amount',
       LEAST(1, GREATEST(0, COALESCE((v_item->>'confidence')::numeric, v_conf))), v_user);
    v_idx := v_idx + 1;
  END LOOP;

  UPDATE "AccountingDocuments"
     SET "Status" = 'Extracted', "ProcessedAt" = now(), "StatusMessage" = NULL,
         "PageCount" = COALESCE("PageCount", NULLIF(p_extracted->>'page_count', '')::int)
   WHERE "Id" = p_document_id;

  RETURN v_ext_id;
END;
$$;

CREATE OR REPLACE FUNCTION accounting.fail_document_extraction(p_document_id UUID, p_message TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "AccountingDocuments"
     SET "Status" = 'Failed', "StatusMessage" = left(p_message, 1000), "ProcessedAt" = now()
   WHERE "Id" = p_document_id AND "Status" = 'Processing';
  IF NOT FOUND THEN RAISE EXCEPTION 'Document is not being processed.' USING ERRCODE = 'check_violation'; END IF;
END;
$$;

-- User corrected a field on the review screen.
CREATE OR REPLACE FUNCTION accounting.override_document_field(p_extraction_id UUID, p_field_name TEXT, p_value TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "DocumentExtractions" WHERE "Id" = p_extraction_id AND "IsAccepted") THEN
    RAISE EXCEPTION 'This extraction has already been accepted and can no longer be edited.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE "DocumentFieldSuggestions" SET "UserOverride" = p_value
   WHERE "ExtractionId" = p_extraction_id AND "FieldName" = p_field_name;
  IF NOT FOUND THEN RAISE EXCEPTION 'Field % not found on this extraction.', p_field_name USING ERRCODE = 'no_data_found'; END IF;
END;
$$;

-- The human decision. The caller has already created the (Draft) voucher from the
-- reviewed values through the ordinary voucher path; this links it and closes the loop.
CREATE OR REPLACE FUNCTION accounting.accept_document_extraction(p_extraction_id UUID, p_voucher_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_ext RECORD;
  v_user UUID := app.current_user_id();
BEGIN
  SELECT * INTO v_ext FROM "DocumentExtractions" WHERE "Id" = p_extraction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Extraction not found.' USING ERRCODE = 'no_data_found'; END IF;
  IF v_ext."IsAccepted" THEN RAISE EXCEPTION 'This extraction was already accepted.' USING ERRCODE = 'check_violation'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "Vouchers" WHERE "Id" = p_voucher_id AND "CompanyId" = v_ext."CompanyId") THEN
    RAISE EXCEPTION 'Voucher not found in this company.' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE "DocumentExtractions"
     SET "IsAccepted" = true, "AcceptedAt" = now(), "AcceptedBy" = v_user, "CreatedVoucherId" = p_voucher_id
   WHERE "Id" = p_extraction_id;
  UPDATE "AccountingDocuments"
     SET "CreatedVoucherId" = p_voucher_id, "Status" = 'Accepted'
   WHERE "Id" = v_ext."DocumentId";
END;
$$;

CREATE OR REPLACE FUNCTION accounting.reject_document(p_document_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "AccountingDocuments" SET "Status" = 'Rejected', "StatusMessage" = left(p_reason, 1000) WHERE "Id" = p_document_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found.' USING ERRCODE = 'no_data_found'; END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Audit + RLS
-- ----------------------------------------------------------------------------
SELECT app.install_audit_trigger('"AccountingDocumentFiles"');
SELECT app.install_audit_trigger('"AccountingDocuments"');
SELECT app.install_audit_trigger('"DocumentExtractions"');
SELECT app.install_audit_trigger('"DocumentFieldSuggestions"');
SELECT app.install_company_rls('"AccountingDocumentFiles"');
SELECT app.install_company_rls('"AccountingDocuments"');
SELECT app.install_company_rls('"DocumentExtractions"');
SELECT app.install_company_rls('"DocumentFieldSuggestions"');
