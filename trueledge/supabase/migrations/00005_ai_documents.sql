-- ============================================================================
-- TrueLedge: Multi-Tenant SaaS Accounting Platform
-- Migration 00005: AI Document Intake & Audit Trail
-- ============================================================================
-- Creates:
--   1. Enum for document lifecycle
--   2. AI tables (documents, extractions, ai_suggestions)
--   3. Indexes for RLS and query performance
--   4. RLS policies (entity-scoped)
-- ============================================================================

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

CREATE TYPE public.document_status AS ENUM (
  'pending',
  'uploading',
  'processing',
  'extracted',
  'accepted',
  'rejected',
  'failed'
);

-- ============================================================================
-- 2. DOCUMENTS
-- ============================================================================
-- Source documents uploaded for AI extraction (invoices, receipts, etc.)

CREATE TABLE public.documents (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id       UUID NOT NULL REFERENCES public.entities(id) ON DELETE RESTRICT,

  -- File metadata
  file_name       TEXT NOT NULL,
  file_url        TEXT NOT NULL,           -- Supabase Storage URL
  file_size       BIGINT,                  -- bytes
  mime_type       TEXT NOT NULL,           -- 'application/pdf', 'image/jpeg', etc.

  -- Status
  status          public.document_status NOT NULL DEFAULT 'pending',
  status_message  TEXT,                    -- Error or progress message

  -- Linked voucher (set after extraction is accepted)
  created_voucher_id UUID REFERENCES public.vouchers(id) ON DELETE SET NULL,

  -- Audit
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by     UUID NOT NULL REFERENCES auth.users(id),
  processed_at    TIMESTAMPTZ,

  -- Metadata
  page_count      INT,
  tags            TEXT[]
);

COMMENT ON TABLE public.documents IS
  'Source documents uploaded for AI extraction. Tracks lifecycle from upload through extraction to voucher creation.';

-- ============================================================================
-- 3. EXTRACTIONS
-- ============================================================================
-- AI extraction results from a document.

CREATE TABLE public.extractions (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id       UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  entity_id         UUID NOT NULL REFERENCES public.entities(id) ON DELETE RESTRICT,

  -- AI model details
  model_used        TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
  model_version     TEXT,
  processing_time_ms INT,

  -- Extraction results
  raw_response      JSONB,                 -- Full API response for audit
  extracted_data    JSONB NOT NULL,         -- Structured invoice data
  confidence_score  NUMERIC(5,4) NOT NULL DEFAULT 0,  -- 0.0000 to 1.0000

  -- Linked output
  created_voucher_id UUID REFERENCES public.vouchers(id) ON DELETE SET NULL,

  -- Status
  is_accepted       BOOLEAN NOT NULL DEFAULT false,
  accepted_at       TIMESTAMPTZ,
  accepted_by       UUID REFERENCES auth.users(id),

  -- Audit
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES auth.users(id)
);

COMMENT ON TABLE public.extractions IS
  'AI extraction results. Stores the raw Gemini response, structured extracted data, and confidence score. Never auto-posts — user must explicitly accept.';

-- ============================================================================
-- 4. AI SUGGESTIONS
-- ============================================================================
-- Per-field confidence scores for UI display.

CREATE TABLE public.ai_suggestions (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  extraction_id   UUID NOT NULL REFERENCES public.extractions(id) ON DELETE CASCADE,
  entity_id       UUID NOT NULL REFERENCES public.entities(id) ON DELETE RESTRICT,

  -- Field details
  field_name      TEXT NOT NULL,            -- e.g. 'supplier_name', 'invoice_date', 'line_items[0].amount'
  field_group     TEXT,                     -- e.g. 'header', 'line_item', 'totals'
  extracted_value TEXT,                     -- What the AI extracted
  confidence      NUMERIC(5,4) NOT NULL DEFAULT 0,

  -- User override
  user_override   TEXT,                     -- What the user corrected to (null = accepted AI value)
  final_value     TEXT,                     -- Resolved value (override ?? extracted)

  -- Audit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (extraction_id, field_name)
);

COMMENT ON TABLE public.ai_suggestions IS
  'Per-field AI confidence scores. Shows extraction confidence for each field in the UI so users know what to review. User overrides are tracked for model improvement.';

-- ============================================================================
-- 5. INDEXES
-- ============================================================================

-- Documents
CREATE INDEX idx_documents_entity ON public.documents(entity_id);
CREATE INDEX idx_documents_status ON public.documents(entity_id, status);
CREATE INDEX idx_documents_uploaded ON public.documents(uploaded_at DESC);
CREATE INDEX idx_documents_voucher ON public.documents(created_voucher_id) WHERE created_voucher_id IS NOT NULL;

-- Extractions
CREATE INDEX idx_extractions_document ON public.extractions(document_id);
CREATE INDEX idx_extractions_entity ON public.extractions(entity_id);
CREATE INDEX idx_extractions_confidence ON public.extractions(confidence_score);
CREATE INDEX idx_extractions_accepted ON public.extractions(is_accepted);

-- AI Suggestions
CREATE INDEX idx_ai_suggestions_extraction ON public.ai_suggestions(extraction_id);
CREATE INDEX idx_ai_suggestions_entity ON public.ai_suggestions(entity_id);
CREATE INDEX idx_ai_suggestions_field ON public.ai_suggestions(extraction_id, field_name);

-- ============================================================================
-- 6. ROW-LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_suggestions ENABLE ROW LEVEL SECURITY;

-- Documents
CREATE POLICY "documents_select" ON public.documents FOR SELECT
  USING (public.has_entity_access(entity_id));
CREATE POLICY "documents_insert" ON public.documents FOR INSERT
  WITH CHECK (public.has_entity_access(entity_id));
CREATE POLICY "documents_update" ON public.documents FOR UPDATE
  USING (public.has_entity_access(entity_id))
  WITH CHECK (public.has_entity_access(entity_id));
CREATE POLICY "documents_delete" ON public.documents FOR DELETE
  USING (public.has_entity_access(entity_id));

-- Extractions
CREATE POLICY "extractions_select" ON public.extractions FOR SELECT
  USING (public.has_entity_access(entity_id));
CREATE POLICY "extractions_insert" ON public.extractions FOR INSERT
  WITH CHECK (public.has_entity_access(entity_id));
CREATE POLICY "extractions_update" ON public.extractions FOR UPDATE
  USING (public.has_entity_access(entity_id))
  WITH CHECK (public.has_entity_access(entity_id));
CREATE POLICY "extractions_delete" ON public.extractions FOR DELETE
  USING (public.has_entity_access(entity_id));

-- AI Suggestions
CREATE POLICY "ai_suggestions_select" ON public.ai_suggestions FOR SELECT
  USING (public.has_entity_access(entity_id));
CREATE POLICY "ai_suggestions_insert" ON public.ai_suggestions FOR INSERT
  WITH CHECK (public.has_entity_access(entity_id));
CREATE POLICY "ai_suggestions_update" ON public.ai_suggestions FOR UPDATE
  USING (public.has_entity_access(entity_id))
  WITH CHECK (public.has_entity_access(entity_id));
CREATE POLICY "ai_suggestions_delete" ON public.ai_suggestions FOR DELETE
  USING (public.has_entity_access(entity_id));
