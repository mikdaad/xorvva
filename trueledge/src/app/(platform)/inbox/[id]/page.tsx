import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DocumentReviewClient } from "./review-client";
import type { DocumentStatus } from "@/types/database.types";

// ---------------------------------------------------------------------------
// Page (Server Component) — loads document + extraction from DB
// ---------------------------------------------------------------------------

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DocumentReviewPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  // 1. Load document record
  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .single();

  if (docErr || !doc) notFound();

  // 2. Load latest extraction
  const { data: extraction } = await supabase
    .from("extractions")
    .select("*")
    .eq("document_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 3. Load AI suggestions
  const { data: suggestions } = extraction
    ? await supabase
        .from("ai_suggestions")
        .select("*")
        .eq("extraction_id", extraction.id)
        .order("field_name")
    : { data: [] };

  // 4. Generate a short-lived signed URL for the file (private bucket)
  //    If the bucket is public, use doc.file_url directly instead
  const storagePath = doc.file_url.split("/documents/").pop() ?? "";
  const { data: signedData } = await supabase.storage
    .from("documents")
    .createSignedUrl(storagePath, 60 * 60); // 1 hour

  const fileUrl = signedData?.signedUrl ?? doc.file_url;

  return (
    <DocumentReviewClient
      documentId={id}
      fileName={doc.file_name}
      mimeType={doc.mime_type}
      fileUrl={fileUrl}
      status={doc.status as DocumentStatus}
      extraction={extraction ? {
        id: extraction.id,
        confidence_score: extraction.confidence_score,
        model_used: extraction.model_used,
        extracted_data: extraction.extracted_data as Record<string, unknown>,
        processing_time_ms: extraction.processing_time_ms,
      } : null}
      suggestions={(suggestions ?? []).map((s) => ({
        field_name: s.field_name as string,
        field_group: s.field_group as string | null,
        extracted_value: s.extracted_value as string | null,
        confidence: s.confidence as number,
        user_override: s.user_override as string | null,
        final_value: s.final_value as string | null,
      }))}
    />
  );
}
