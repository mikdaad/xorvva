import { redirect } from "next/navigation";
import Link from "next/link";
import { requireActiveEntity } from "@/lib/entity-context";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Audit Trail | TrueLedge",
};

interface AuditLogRow {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  user_id: string;
  created_at: string;
}

export default async function AuditTrailPage() {
  const entityId = await requireActiveEntity();
  if (!entityId) {
    redirect("/entities");
  }

  const supabase = await createClient();

  const { data: auditLogs } = await supabase
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, user_id, created_at")
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(50);

  const logs = (auditLogs ?? []) as AuditLogRow[];

  return (
    <div className="flex h-full flex-col space-y-6">
      <div className="border-b border-border pb-5">
        <nav className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground">
            Gateway
          </Link>
          <span>/</span>
          <span>Reports</span>
          <span>/</span>
          <span className="text-foreground">Audit Trail</span>
        </nav>
        <h1 className="text-xl font-bold tracking-tight">System Audit Trail</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Immutable history of record creations, updates, postings, and user activities ({logs.length} recent entries)
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/40">
            <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="px-6 py-3">Timestamp</th>
              <th className="px-3 py-3">Action</th>
              <th className="px-3 py-3">Target Entity</th>
              <th className="px-6 py-3 text-right">Record ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {logs.length > 0 ? (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-muted/30 transition-colors text-xs">
                  <td className="px-6 py-3 font-mono text-muted-foreground">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-3 font-semibold uppercase text-emerald-400">
                    {log.action}
                  </td>
                  <td className="px-3 py-3 capitalize text-foreground font-medium">
                    {log.entity_type}
                  </td>
                  <td className="px-6 py-3 text-right font-mono text-xs text-muted-foreground">
                    {log.id.slice(0, 8)}…
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="p-12 text-center text-xs text-muted-foreground">
                  No audit log records recorded yet for this company entity.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
