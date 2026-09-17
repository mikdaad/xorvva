"use server";

import { createClient } from "@/lib/supabase/server";
import { extractInvoiceFromDocument } from "@/lib/ai/gemini";
import type { DocumentStatus } from "@/types/database.types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InboxActionResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * Upload a document for AI extraction.
 * Stores in Supabase Storage and creates a `documents` row.
 */
export async function uploadDocument(
  entityId: string,
  fileName: string,
  fileBuffer: Uint8Array,
  mimeType: string
): Promise<InboxActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    // 1. Upload to Supabase Storage
    const storagePath = `${entityId}/${Date.now()}_${fileName}`;
    const { error: uploadErr } = await supabase.storage
      .from("documents")
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadErr) {
      return { success: false, error: `Storage upload failed: ${uploadErr.message}` };
    }

    // 2. Get public URL
    const { data: urlData } = supabase.storage
      .from("documents")
      .getPublicUrl(storagePath);

    // 3. Create document record
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .insert({
        entity_id: entityId,
        file_name: fileName,
        file_url: urlData.publicUrl,
        file_size: fileBuffer.length,
        mime_type: mimeType,
        status: "pending" as DocumentStatus,
        uploaded_by: user.id,
      })
      .select("id")
      .single();

    if (docErr) return { success: false, error: docErr.message };

    return { success: true, data: { document_id: doc.id, file_url: urlData.publicUrl } };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Extract data from an uploaded document using Gemini Vision API.
 * Creates an extraction record and per-field AI suggestions.
 *
 * SAFETY: This function NEVER creates a posted voucher.
 * All AI-created vouchers are strictly 'draft' status.
 */
export async function extractDocument(
  documentId: string
): Promise<InboxActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    // 1. Fetch the document
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (docErr || !doc) return { success: false, error: "Document not found." };

    // 2. Update status to processing
    await supabase
      .from("documents")
      .update({ status: "processing" as DocumentStatus })
      .eq("id", documentId);

    // 3. Download file from storage
    const storagePath = doc.file_url.split("/documents/")[1];
    if (!storagePath) {
      await supabase
        .from("documents")
        .update({
          status: "failed" as DocumentStatus,
          status_message: "Could not resolve storage path from file URL.",
        })
        .eq("id", documentId);
      return { success: false, error: "Invalid file URL." };
    }

    const { data: fileData, error: dlErr } = await supabase.storage
      .from("documents")
      .download(storagePath);

    if (dlErr || !fileData) {
      await supabase
        .from("documents")
        .update({
          status: "failed" as DocumentStatus,
          status_message: `Download failed: ${dlErr?.message}`,
        })
        .eq("id", documentId);
      return { success: false, error: `File download failed: ${dlErr?.message}` };
    }

    // 4. Fetch available masters for AI matching
    const [
      { data: parties },
      { data: items },
      { data: accounts }
    ] = await Promise.all([
      supabase.from("parties").select("id, name, trn").eq("entity_id", doc.entity_id).eq("is_active", true),
      supabase.from("items").select("id, name, purchase_account_id, tax_code_id").eq("entity_id", doc.entity_id).eq("is_active", true),
      supabase.from("accounts").select("id, name").eq("entity_id", doc.entity_id).eq("is_group", false).eq("is_active", true)
    ]);

    const availableMasters = {
      parties: parties || [],
      items: items || [],
      accounts: accounts || [],
    };

    // 5. Call Gemini Vision API
    const buffer = new Uint8Array(await fileData.arrayBuffer());
    const extraction = await extractInvoiceFromDocument(buffer, doc.mime_type, availableMasters);

    if (!extraction.success || !extraction.data) {
      await supabase
        .from("documents")
        .update({
          status: "failed" as DocumentStatus,
          status_message: extraction.error ?? "Extraction failed.",
        })
        .eq("id", documentId);
      return { success: false, error: extraction.error };
    }

    // 5. Save extraction record
    const { data: ext, error: extErr } = await supabase
      .from("extractions")
      .insert({
        document_id: documentId,
        entity_id: doc.entity_id,
        model_used: extraction.model_used,
        raw_response: extraction.raw_response as Record<string, unknown>,
        extracted_data: extraction.data as unknown as Record<string, unknown>,
        confidence_score: extraction.data.overall_confidence,
        processing_time_ms: extraction.processing_time_ms,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (extErr) {
      await supabase
        .from("documents")
        .update({
          status: "failed" as DocumentStatus,
          status_message: extErr.message,
        })
        .eq("id", documentId);
      return { success: false, error: extErr.message };
    }

    // 7. Save per-field AI suggestions
    const fieldConfidence = extraction.data.field_confidence ?? {};
    const suggestions = [
      { field_name: "supplier_name", field_group: "header", extracted_value: extraction.data.supplier_name, confidence: fieldConfidence.supplier_name ?? extraction.data.overall_confidence },
      { field_name: "supplier_trn", field_group: "header", extracted_value: extraction.data.supplier_trn, confidence: fieldConfidence.supplier_trn ?? extraction.data.overall_confidence },
      { field_name: "buyer_name", field_group: "header", extracted_value: extraction.data.buyer_name, confidence: fieldConfidence.supplier_name ?? extraction.data.overall_confidence },
      { field_name: "buyer_trn", field_group: "header", extracted_value: extraction.data.buyer_trn, confidence: fieldConfidence.supplier_trn ?? extraction.data.overall_confidence },
      { field_name: "invoice_number", field_group: "header", extracted_value: extraction.data.invoice_number, confidence: fieldConfidence.invoice_number ?? extraction.data.overall_confidence },
      { field_name: "invoice_date", field_group: "header", extracted_value: extraction.data.invoice_date, confidence: fieldConfidence.invoice_date ?? extraction.data.overall_confidence },
      { field_name: "due_date", field_group: "header", extracted_value: extraction.data.due_date, confidence: fieldConfidence.due_date ?? extraction.data.overall_confidence },
      { field_name: "subtotal", field_group: "totals", extracted_value: String(extraction.data.subtotal), confidence: fieldConfidence.totals ?? extraction.data.overall_confidence },
      { field_name: "tax_total", field_group: "totals", extracted_value: String(extraction.data.tax_total), confidence: fieldConfidence.totals ?? extraction.data.overall_confidence },
      { field_name: "grand_total", field_group: "totals", extracted_value: String(extraction.data.grand_total), confidence: fieldConfidence.totals ?? extraction.data.overall_confidence },
    ];

    // Add line item suggestions
    extraction.data.line_items.forEach((item, idx) => {
      suggestions.push({
        field_name: `line_items[${idx}].description`,
        field_group: "line_item",
        extracted_value: item.description,
        confidence: item.confidence,
      });
      suggestions.push({
        field_name: `line_items[${idx}].amount`,
        field_group: "line_item",
        extracted_value: String(item.amount),
        confidence: item.confidence,
      });
    });

    await supabase.from("ai_suggestions").insert(
      suggestions.map((s) => ({
        extraction_id: ext.id,
        entity_id: doc.entity_id,
        field_name: s.field_name,
        field_group: s.field_group,
        extracted_value: s.extracted_value,
        confidence: s.confidence,
        final_value: s.extracted_value, // Default final = extracted
      }))
    );

    // 8. Update document status
    await supabase
      .from("documents")
      .update({
        status: "extracted" as DocumentStatus,
        processed_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    return {
      success: true,
      data: {
        extraction_id: ext.id,
        confidence: extraction.data.overall_confidence,
        model: extraction.model_used,
        processing_time_ms: extraction.processing_time_ms,
      },
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Fetch all documents for an entity.
 */
export async function getDocuments(entityId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("entity_id", entityId)
    .order("uploaded_at", { ascending: false });

  return { data, error: error?.message };
}

/**
 * Fetch extraction details for a document.
 */
export async function getExtraction(documentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("extractions")
    .select("*")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return { data, error: error?.message };
}

/**
 * Fetch AI suggestions for an extraction.
 */
export async function getAISuggestions(extractionId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_suggestions")
    .select("*")
    .eq("extraction_id", extractionId)
    .order("field_name");

  return { data, error: error?.message };
}
