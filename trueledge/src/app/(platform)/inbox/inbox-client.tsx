"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { uploadDocument, extractDocument } from "@/lib/actions/inbox";

interface UploadState {
  status: "idle" | "uploading" | "extracting" | "done" | "error";
  message: string;
  documentId?: string;
}

interface InboxUploadClientProps {
  entityId: string;
}

const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export function InboxUploadClient({ entityId }: InboxUploadClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dragActive, setDragActive] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>({ status: "idle", message: "" });

  async function processFile(file: File) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setUploadState({ status: "error", message: "Only PDF, JPEG, PNG, and WebP files are supported." });
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setUploadState({ status: "error", message: `File too large. Max size is 10 MB (${(file.size / 1024 / 1024).toFixed(1)} MB uploaded).` });
      return;
    }

    setUploadState({ status: "uploading", message: `Uploading ${file.name}…` });

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // Upload to storage + create DB record
    const uploadResult = await uploadDocument(entityId, file.name, buffer, file.type);
    if (!uploadResult.success || !uploadResult.data?.document_id) {
      setUploadState({ status: "error", message: uploadResult.error ?? "Upload failed." });
      return;
    }

    const documentId = uploadResult.data.document_id as string;
    setUploadState({ status: "extracting", message: "Extracting data with Gemini AI…", documentId });

    // Trigger Gemini extraction
    const extractResult = await extractDocument(documentId);
    if (!extractResult.success) {
      setUploadState({
        status: "error",
        message: extractResult.error ?? "Extraction failed. You can still review the document manually.",
        documentId,
      });
      return;
    }

    setUploadState({ status: "done", message: "Extraction complete!", documentId });

    // Navigate to split-view review
    startTransition(() => {
      router.push(`/inbox/${documentId}`);
      router.refresh();
    });
  }

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await processFile(file);
  }, [entityId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await processFile(file);
    // Reset input so the same file can be re-selected
    e.target.value = "";
  }, [entityId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isProcessing = uploadState.status === "uploading" || uploadState.status === "extracting";

  return (
    <Card>
      <CardContent className="pt-6">
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-all duration-200 ${
            isProcessing
              ? "border-violet-500/60 bg-violet-500/5 cursor-not-allowed"
              : dragActive
              ? "border-violet-500 bg-violet-500/8 scale-[1.01]"
              : "border-border hover:border-violet-500/50 hover:bg-muted/20"
          }`}
        >
          {/* Icon */}
          <div className={`flex h-14 w-14 items-center justify-center rounded-full mb-4 transition-colors ${
            isProcessing ? "bg-violet-500/20 animate-pulse" : "bg-violet-500/10"
          }`}>
            {isProcessing ? (
              <svg className="h-7 w-7 text-violet-400 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-violet-400">
                <path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" />
              </svg>
            )}
          </div>

          {/* Status message */}
          {isProcessing ? (
            <>
              <p className="text-base font-medium mb-1">{uploadState.message}</p>
              <div className="flex items-center gap-2 mt-2">
                <div className={`h-2 w-2 rounded-full bg-violet-400 ${uploadState.status === "uploading" ? "animate-bounce" : "bg-emerald-400"}`} />
                <span className="text-xs text-muted-foreground">
                  {uploadState.status === "uploading" ? "Uploading to secure storage…" : "Gemini Vision API is reading your document…"}
                </span>
              </div>
              {/* Step indicators */}
              <div className="flex items-center gap-3 mt-4">
                <div className={`flex items-center gap-1.5 text-xs ${uploadState.status === "uploading" ? "text-violet-400" : "text-emerald-400"}`}>
                  {uploadState.status === "uploading" ? (
                    <span className="h-4 w-4 rounded-full border-2 border-violet-400 border-t-transparent animate-spin inline-block" />
                  ) : (
                    <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>
                  )}
                  Upload
                </div>
                <div className="h-px w-8 bg-border" />
                <div className={`flex items-center gap-1.5 text-xs ${uploadState.status === "extracting" ? "text-violet-400" : "text-muted-foreground"}`}>
                  {uploadState.status === "extracting" ? (
                    <span className="h-4 w-4 rounded-full border-2 border-violet-400 border-t-transparent animate-spin inline-block" />
                  ) : (
                    <span className="h-4 w-4 rounded-full border border-current inline-flex items-center justify-center text-[9px] font-bold">2</span>
                  )}
                  AI Extract
                </div>
                <div className="h-px w-8 bg-border" />
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-4 w-4 rounded-full border border-current inline-flex items-center justify-center text-[9px] font-bold">3</span>
                  Review
                </div>
              </div>
            </>
          ) : uploadState.status === "error" ? (
            <>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 mb-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-red-400">
                  <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" />
                </svg>
              </div>
              <p className="text-sm font-medium text-red-400 mb-1">Upload failed</p>
              <p className="text-xs text-muted-foreground mb-3 max-w-xs">{uploadState.message}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUploadState({ status: "idle", message: "" })}
                className="cursor-pointer"
              >
                Try again
              </Button>
            </>
          ) : (
            <>
              <p className="text-lg font-medium mb-1">Drop invoices or receipts here</p>
              <p className="text-sm text-muted-foreground mb-4">
                AI will extract supplier, TRN, dates, and line items automatically
              </p>
              <label className="cursor-pointer">
                <span className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" />
                  </svg>
                  Upload Documents
                </span>
                <input type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={handleFileInput} className="hidden" />
              </label>
              <p className="text-xs text-muted-foreground mt-3">PDF, JPEG, PNG, WebP • Max 10 MB</p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
