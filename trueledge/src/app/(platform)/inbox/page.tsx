import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InboxUploadClient } from "./inbox-client";
import type { DocumentStatus } from "@/types/database.types";

// ---------------------------------------------------------------------------
// Status badge (server-renderable)
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: DocumentStatus }) {
  const variants: Record<DocumentStatus, { className: string; label: string }> = {
    pending:    { className: "bg-slate-500/15 text-slate-400 border-slate-500/30",   label: "Pending"    },
    uploading:  { className: "bg-sky-500/15 text-sky-400 border-sky-500/30",         label: "Uploading"  },
    processing: { className: "bg-violet-500/15 text-violet-400 border-violet-500/30", label: "Processing" },
    extracted:  { className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", label: "Extracted" },
    accepted:   { className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", label: "Accepted"  },
    rejected:   { className: "bg-amber-500/15 text-amber-400 border-amber-500/30",   label: "Rejected"   },
    failed:     { className: "bg-red-500/15 text-red-400 border-red-500/30",         label: "Failed"     },
  };
  const v = variants[status] ?? variants.pending;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${v.className}`}>
      {v.label}
    </span>
  );
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 85 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5 min-w-[64px]">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground w-7 text-right">{pct}%</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page (Server Component)
// ---------------------------------------------------------------------------

export default async function InboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Resolve user's primary entity
  const { data: entityAccess } = await supabase
    .from("entity_users")
    .select("entity_id")
    .eq("user_id", user?.id ?? "")
    .limit(1)
    .single();

  const entityId = entityAccess?.entity_id ?? "";

  // Fetch documents with their latest extraction confidence
  type DocRow = {
    id: string;
    file_name: string;
    mime_type: string;
    file_size: number | null;
    status: DocumentStatus;
    uploaded_at: string;
    created_voucher_id: string | null;
    extractions: { confidence_score: number }[];
  };

  const { data: documents } = entityId
    ? await supabase
        .from("documents")
        .select("id, file_name, mime_type, file_size, status, uploaded_at, created_voucher_id, extractions(confidence_score)")
        .eq("entity_id", entityId)
        .order("uploaded_at", { ascending: false })
        .limit(50)
    : { data: [] as DocRow[] };

  const docs = (documents as DocRow[]) ?? [];

  // Stats
  const totalDocs = docs.length;
  const awaitingReview = docs.filter((d) => d.status === "extracted").length;
  const accepted = docs.filter((d) => d.status === "accepted").length;

  return (
    <div className="space-y-6">
      {/* Upload zone (interactive — client component) */}
      {entityId ? (
        <InboxUploadClient entityId={entityId} />
      ) : (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <p className="text-muted-foreground text-sm">No entity found. Please complete onboarding first.</p>
          </CardContent>
        </Card>
      )}

      {/* How it works */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            step: "1",
            icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>,
            title: "Upload",
            desc: "Drop a PDF or photo of an invoice, bill, or receipt.",
          },
          {
            step: "2",
            icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" /></svg>,
            title: "AI Extracts",
            desc: "Gemini Vision reads supplier, TRN, dates, and all line items.",
          },
          {
            step: "3",
            icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M20 6 9 17l-5-5" /></svg>,
            title: "Review & Post",
            desc: "Verify the draft voucher side-by-side, then post to your books.",
          },
        ].map((s) => (
          <Card key={s.step} className="text-center">
            <CardContent className="pt-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-500/10 text-violet-400 mx-auto mb-3">
                {s.icon}
              </div>
              <h3 className="font-semibold text-sm mb-1">{s.title}</h3>
              <p className="text-xs text-muted-foreground">{s.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Stats row */}
      {totalDocs > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Documents", value: totalDocs, color: "text-foreground" },
            { label: "Awaiting Review", value: awaitingReview, color: "text-amber-400" },
            { label: "Accepted", value: accepted, color: "text-emerald-400" },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="pt-5 pb-4">
                <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Document list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Documents</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {docs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-t border-b border-border bg-muted/30">
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">File</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Type</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Size</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Uploaded</th>
                    <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Confidence</th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {docs.map((doc) => {
                    const confidence = doc.extractions?.[0]?.confidence_score ?? null;
                    const fileExt = doc.mime_type.split("/")[1]?.toUpperCase() ?? "FILE";
                    return (
                      <tr key={doc.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium">
                          <span className="truncate max-w-52 block">{doc.file_name}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                            {fileExt}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {formatFileSize(doc.file_size)}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {new Date(doc.uploaded_at).toLocaleDateString("en-AE", {
                            day: "2-digit", month: "short", year: "numeric",
                          })}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={doc.status} />
                        </td>
                        <td className="px-4 py-3">
                          {confidence !== null ? (
                            <ConfidenceBar score={confidence} />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {doc.created_voucher_id && (
                              <Link href={`/transactions/new?draftId=${doc.created_voucher_id}`}>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="cursor-pointer border-violet-500/30 text-violet-500 hover:bg-violet-500/10"
                                >
                                  Post Voucher
                                </Button>
                              </Link>
                            )}
                            <Link href={`/inbox/${doc.id}`}>
                              <Button
                                variant={doc.status === "extracted" ? "default" : "outline"}
                                size="sm"
                                className={`cursor-pointer ${doc.status === "extracted" ? "bg-violet-600 hover:bg-violet-700 text-white" : ""}`}
                              >
                                {doc.status === "extracted" ? "Review" : "View"}
                              </Button>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-violet-500/10 mb-5">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 text-violet-400">
                  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                  <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                  <path d="M12 8V4H8" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">No documents yet</h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                Upload an invoice, bill, or receipt above. Gemini AI will extract the data and create a draft voucher for you to review.
              </p>
              <div className="mt-6 flex items-start gap-3 text-left rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 max-w-xs">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-amber-400 mt-0.5 shrink-0">
                  <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" />
                </svg>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-amber-400">AI Safety Guarantee</span><br />
                  AI-extracted vouchers are always created as <strong>drafts</strong>. The system will never auto-post.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
