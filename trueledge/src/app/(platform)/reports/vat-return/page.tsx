import { redirect } from "next/navigation";
import Link from "next/link";
import { requireActiveEntity } from "@/lib/entity-context";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "VAT Return (FTA VAT 201) | TrueLedge",
};

export default async function VatReturnReportPage() {
  const entityId = await requireActiveEntity();
  if (!entityId) {
    redirect("/entities");
  }

  const supabase = await createClient();

  const { data: entity } = await supabase
    .from("entities")
    .select("trade_name, trn, tax_treatment, base_currency")
    .eq("id", entityId)
    .single();

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
          <span className="text-foreground">VAT Return</span>
        </nav>
        <h1 className="text-xl font-bold tracking-tight">UAE FTA VAT 201 Return</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Federal Tax Authority compliant tax returns for {entity?.trade_name ?? "Company"} (TRN: {entity?.trn ?? "Not Registered"})
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h2 className="text-base font-bold text-foreground">FTA Box Summary (VAT 201)</h2>
            <p className="text-xs text-muted-foreground">Standard 5% Rate, Zero-Rated, Exempt &amp; Reverse Charge Mechanism</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400">
              TRN Verified: {entity?.trn || "Unregistered"}
            </span>
          </div>
        </div>

        <div className="mt-6 divide-y divide-border/60">
          <div className="flex items-center justify-between py-3 text-sm">
            <div>
              <span className="font-mono text-xs font-bold text-emerald-400">Box 1a</span>
              <span className="ml-3 text-foreground font-medium">Standard Rated Supplies in Abu Dhabi (5%)</span>
            </div>
            <span className="font-mono text-xs text-muted-foreground">AED 0.00</span>
          </div>

          <div className="flex items-center justify-between py-3 text-sm">
            <div>
              <span className="font-mono text-xs font-bold text-emerald-400">Box 1b</span>
              <span className="ml-3 text-foreground font-medium">Standard Rated Supplies in Dubai (5%)</span>
            </div>
            <span className="font-mono text-xs text-muted-foreground">AED 0.00</span>
          </div>

          <div className="flex items-center justify-between py-3 text-sm">
            <div>
              <span className="font-mono text-xs font-bold text-emerald-400">Box 3</span>
              <span className="ml-3 text-foreground font-medium">Zero Rated Supplies (0%)</span>
            </div>
            <span className="font-mono text-xs text-muted-foreground">AED 0.00</span>
          </div>

          <div className="flex items-center justify-between py-3 text-sm">
            <div>
              <span className="font-mono text-xs font-bold text-emerald-400">Box 9</span>
              <span className="ml-3 text-foreground font-medium">Standard Rated Expenses &amp; Input Tax (5%)</span>
            </div>
            <span className="font-mono text-xs text-muted-foreground">AED 0.00</span>
          </div>
        </div>
      </div>
    </div>
  );
}
