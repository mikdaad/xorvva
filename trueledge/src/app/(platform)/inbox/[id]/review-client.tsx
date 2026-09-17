"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getConfidenceBadge, CONFIDENCE_THRESHOLDS } from "@/lib/ai/gemini";
import type { DocumentStatus } from "@/types/database.types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Suggestion {
  field_name: string;
  field_group: string | null;
  extracted_value: string | null;
  confidence: number;
  user_override: string | null;
  final_value: string | null;
}

interface ExtractionData {
  supplier_name?: string | null;
  supplier_trn?: string | null;
  buyer_name?: string | null;
  buyer_trn?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  currency?: string;
  place_of_supply?: string | null;
  document_type?: string;
  subtotal?: number;
  tax_total?: number;
  grand_total?: number;
  overall_confidence?: number;
  line_items?: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    tax_rate: number;
    amount: number;
    confidence: number;
  }>;
}

interface DocumentReviewClientProps {
  documentId: string;
  fileName: string;
  mimeType: string;
  fileUrl: string;
  status: DocumentStatus;
  extraction: {
    id: string;
    confidence_score: number;
    model_used: string;
    extracted_data: Record<string, unknown>;
    processing_time_ms: number | null;
  } | null;
  suggestions: Suggestion[];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ConfidenceIndicator({ score }: { score: number }) {
  const badge = getConfidenceBadge(score);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${badge.className}`}
      title={`${badge.label} — ${Math.round(score * 100)}% confidence`}
    >
      {Math.round(score * 100)}%
    </span>
  );
}

function FieldRow({
  label,
  value,
  confidence,
  type = "text",
  mono = false,
  maxLength,
  onChange,
}: {
  label: string;
  value: string;
  confidence: number;
  type?: string;
  mono?: boolean;
  maxLength?: number;
  onChange: (v: string) => void;
}) {
  const isLowConfidence = confidence < CONFIDENCE_THRESHOLDS.MEDIUM;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className={`text-xs ${isLowConfidence ? "text-amber-400" : ""}`}>{label}</Label>
        <ConfidenceIndicator score={confidence} />
      </div>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        className={`h-8 text-sm ${mono ? "font-mono" : ""} ${
          isLowConfidence ? "border-amber-500/50 focus-visible:ring-amber-500/30" : ""
        }`}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Client Component
// ---------------------------------------------------------------------------

export function DocumentReviewClient({
  documentId,
  fileName,
  mimeType,
  fileUrl,
  status,
  extraction,
  suggestions,
}: DocumentReviewClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const data = extraction?.extracted_data as ExtractionData | undefined;
  const lineItems = data?.line_items ?? [];

  // Editable form state — seeded from AI extraction
  const [supplierName, setSupplierName] = useState(data?.supplier_name ?? "");
  const [supplierTrn, setSupplierTrn] = useState(data?.supplier_trn ?? "");
  const [buyerName, setBuyerName] = useState(data?.buyer_name ?? "");
  const [buyerTrn, setBuyerTrn] = useState(data?.buyer_trn ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(data?.invoice_number ?? "");
  const [invoiceDate, setInvoiceDate] = useState(data?.invoice_date ?? "");
  const [dueDate, setDueDate] = useState(data?.due_date ?? "");

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const overallConfidence = extraction?.confidence_score ?? 0;
  const badge = getConfidenceBadge(overallConfidence);

  function getFieldConf(name: string): number {
    const s = suggestions.find((s) => s.field_name === name);
    return s?.confidence ?? overallConfidence;
  }

  function formatAmount(n: number | undefined) {
    if (n === undefined || n === null) return "—";
    return n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Accept: mark extraction as accepted (voucher creation handled separately)
  async function handleAccept() {
    setActionError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/inbox/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentId,
            extractionId: extraction?.id,
            overrides: { supplierName, supplierTrn, buyerName, buyerTrn, invoiceNumber, invoiceDate, dueDate },
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        setActionSuccess("Document accepted. Draft voucher created.");
        router.push("/inbox");
        router.refresh();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Failed to accept document.");
      }
    });
  }

  // Reject: update document status to rejected
  async function handleReject() {
    setActionError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/inbox/reject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId }),
        });
        if (!res.ok) throw new Error(await res.text());
        router.push("/inbox");
        router.refresh();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Failed to reject document.");
      }
    });
  }

  const isAlreadyProcessed = status === "accepted" || status === "rejected";

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)] gap-0">
      {/* ------------------------------------------------------------------ */}
      {/* Action bar */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-between pb-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate max-w-72" title={fileName}>{fileName}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {extraction && (
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge.className}`}>
                  {badge.label} · {Math.round(overallConfidence * 100)}%
                </span>
              )}
              {extraction?.processing_time_ms && (
                <span className="text-[10px] text-muted-foreground">
                  Extracted in {(extraction.processing_time_ms / 1000).toFixed(1)}s · {extraction.model_used}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {actionError && (
            <span className="text-xs text-red-400 max-w-xs truncate">{actionError}</span>
          )}
          {actionSuccess && (
            <span className="text-xs text-emerald-400">{actionSuccess}</span>
          )}
          {!isAlreadyProcessed && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive cursor-pointer"
                onClick={handleReject}
                disabled={isPending}
              >
                {isPending ? "…" : "Reject"}
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                onClick={handleAccept}
                disabled={isPending || !extraction}
              >
                {isPending ? "Processing…" : "Accept & Create Draft"}
              </Button>
            </>
          )}
          {isAlreadyProcessed && (
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${
              status === "accepted"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : "bg-amber-500/10 border-amber-500/30 text-amber-400"
            }`}>
              {status === "accepted" ? "✓ Accepted" : "✗ Rejected"}
            </span>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Split view */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0 overflow-hidden">

        {/* Left: Document viewer */}
        <Card className="flex flex-col min-h-0 overflow-hidden">
          <CardHeader className="pb-2 shrink-0 border-b border-border">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Original Document</CardTitle>
              <div className="flex items-center gap-2">
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                  {mimeType.split("/")[1]?.toUpperCase()}
                </span>
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                    <path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6" /><path d="m21 3-9 9" /><path d="M15 3h6v6" />
                  </svg>
                  Open
                </a>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0 min-h-0 overflow-hidden">
            {mimeType === "application/pdf" ? (
              <iframe
                src={`${fileUrl}#toolbar=0&navpanes=0`}
                className="w-full h-full border-0 rounded-b-lg"
                title={fileName}
              />
            ) : mimeType.startsWith("image/") ? (
              <div className="w-full h-full overflow-auto bg-muted/20 flex items-center justify-center p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fileUrl}
                  alt={fileName}
                  className="max-w-full max-h-full object-contain rounded"
                />
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                Preview not available for this file type.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Extraction form */}
        <Card className="flex flex-col min-h-0 overflow-hidden">
          <CardHeader className="pb-2 shrink-0 border-b border-border">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Extracted Draft Voucher</CardTitle>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
                Draft · Not Posted
              </span>
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto p-4 space-y-5">
            {extraction && data ? (
              <>
                {/* -------------------------------------------------------- */}
                {/* Confidence alert */}
                {/* -------------------------------------------------------- */}
                {overallConfidence < CONFIDENCE_THRESHOLDS.MEDIUM && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-amber-400 shrink-0 mt-0.5">
                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" />
                    </svg>
                    <p className="text-xs text-amber-300 leading-relaxed">
                      <strong>Low confidence extraction.</strong> The document may be blurry, partially obscured, or handwritten. Please verify all fields carefully before accepting.
                    </p>
                  </div>
                )}

                {/* -------------------------------------------------------- */}
                {/* Supplier */}
                {/* -------------------------------------------------------- */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Supplier</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <FieldRow label="Supplier Name" value={supplierName} confidence={getFieldConf("supplier_name")} onChange={setSupplierName} />
                    <FieldRow label="TRN" value={supplierTrn} confidence={getFieldConf("supplier_trn")} mono maxLength={15} onChange={setSupplierTrn} />
                  </div>
                </div>

                {/* -------------------------------------------------------- */}
                {/* Buyer */}
                {/* -------------------------------------------------------- */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Buyer</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <FieldRow label="Buyer Name" value={buyerName} confidence={getFieldConf("buyer_name")} onChange={setBuyerName} />
                    <FieldRow label="Buyer TRN" value={buyerTrn} confidence={getFieldConf("buyer_trn")} mono maxLength={15} onChange={setBuyerTrn} />
                  </div>
                </div>

                {/* -------------------------------------------------------- */}
                {/* Invoice details */}
                {/* -------------------------------------------------------- */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Invoice Details</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <FieldRow label="Invoice #" value={invoiceNumber} confidence={getFieldConf("invoice_number")} mono onChange={setInvoiceNumber} />
                    <FieldRow label="Invoice Date" type="date" value={invoiceDate} confidence={getFieldConf("invoice_date")} onChange={setInvoiceDate} />
                    <FieldRow label="Due Date" type="date" value={dueDate} confidence={getFieldConf("due_date")} onChange={setDueDate} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Currency</Label>
                      <Input value={data.currency ?? "AED"} readOnly className="h-8 text-sm font-mono bg-muted/30" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Document Type</Label>
                      <Input value={(data.document_type ?? "invoice").replace("_", " ")} readOnly className="h-8 text-sm capitalize bg-muted/30" />
                    </div>
                  </div>
                </div>

                {/* -------------------------------------------------------- */}
                {/* Line items */}
                {/* -------------------------------------------------------- */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Line Items</h4>
                  {lineItems.length > 0 ? (
                    <div className="rounded-lg border border-border overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-muted/30">
                            <th className="text-left text-[10px] font-medium text-muted-foreground px-3 py-2">Description</th>
                            <th className="text-right text-[10px] font-medium text-muted-foreground px-2 py-2 w-12">Qty</th>
                            <th className="text-right text-[10px] font-medium text-muted-foreground px-2 py-2 w-20">Price</th>
                            <th className="text-right text-[10px] font-medium text-muted-foreground px-2 py-2 w-14">VAT%</th>
                            <th className="text-right text-[10px] font-medium text-muted-foreground px-2 py-2 w-20">Total</th>
                            <th className="text-center text-[10px] font-medium text-muted-foreground px-2 py-2 w-12">Conf</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {lineItems.map((item, idx) => (
                            <tr key={idx} className={item.confidence < CONFIDENCE_THRESHOLDS.MEDIUM ? "bg-amber-500/5" : ""}>
                              <td className="px-3 py-2 text-xs">{item.description}</td>
                              <td className="px-2 py-2 text-xs text-right font-mono">{item.quantity}</td>
                              <td className="px-2 py-2 text-xs text-right font-mono">{formatAmount(item.unit_price)}</td>
                              <td className="px-2 py-2 text-xs text-right">{item.tax_rate}%</td>
                              <td className="px-2 py-2 text-xs text-right font-mono font-semibold">{formatAmount(item.amount)}</td>
                              <td className="px-2 py-2 text-center">
                                <ConfidenceIndicator score={item.confidence} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-4 border border-dashed border-border rounded-lg">
                      No line items extracted. Please add them manually after accepting.
                    </p>
                  )}
                </div>

                {/* -------------------------------------------------------- */}
                {/* Totals */}
                {/* -------------------------------------------------------- */}
                <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <div className="flex items-center gap-2">
                      <ConfidenceIndicator score={getFieldConf("subtotal")} />
                      <span className="font-mono">{formatAmount(data.subtotal)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">VAT (5%)</span>
                    <div className="flex items-center gap-2">
                      <ConfidenceIndicator score={getFieldConf("tax_total")} />
                      <span className="font-mono">{formatAmount(data.tax_total)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between font-semibold text-sm border-t border-border pt-2 mt-2">
                    <span>Grand Total</span>
                    <div className="flex items-center gap-2">
                      <ConfidenceIndicator score={getFieldConf("grand_total")} />
                      <span className="font-mono text-emerald-400">
                        {data.currency ?? "AED"} {formatAmount(data.grand_total)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Place of supply */}
                {data.place_of_supply && (
                  <p className="text-xs text-muted-foreground">
                    Place of supply: <span className="font-medium text-foreground">{data.place_of_supply}</span>
                  </p>
                )}
              </>
            ) : (
              /* No extraction yet */
              <div className="flex flex-col items-center justify-center h-full text-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-500/10">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-violet-400">
                    <path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-sm mb-1">No extraction available</h3>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    The AI extraction has not run yet or failed. Return to the Inbox and re-upload the document.
                  </p>
                </div>
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 max-w-xs text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-amber-400">
                      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                    <span className="text-[11px] font-semibold text-amber-400">AI Safety Guarantee</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    AI vouchers are always <strong>drafts</strong>. The system will never auto-post without your explicit approval.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
