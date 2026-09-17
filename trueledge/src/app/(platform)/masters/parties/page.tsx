import { redirect } from "next/navigation";
import Link from "next/link";
import { requireActiveEntity } from "@/lib/entity-context";
import { getParties } from "@/lib/actions/parties";
import { getTaxCodes } from "@/lib/actions/tax-codes";
import { createClient } from "@/lib/supabase/server";
import { PartiesClient } from "./parties-client";

export const metadata = {
  title: "Parties Master | TrueLedge",
};

export default async function PartiesPage() {
  const entityId = await requireActiveEntity();

  if (!entityId) {
    redirect("/entities");
  }

  const supabase = await createClient();

  const [parties, taxCodes, accountsResult] = await Promise.all([
    getParties(entityId),
    getTaxCodes(entityId),
    supabase
      .from("accounts")
      .select("id, name")
      .eq("entity_id", entityId)
      .eq("is_group", false)
      .eq("is_active", true)
      .order("name"),
  ]);

  const accounts = (accountsResult.data ?? []) as { id: string; name: string }[];

  const customerCount = parties.filter((p) => p.party_type === "customer" || p.party_type === "both").length;
  const supplierCount = parties.filter((p) => p.party_type === "supplier" || p.party_type === "both").length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border px-6 py-5">
        <div>
          <nav className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Link href="/dashboard" className="hover:text-foreground">
              Gateway
            </Link>
            <span>/</span>
            <span>Masters</span>
            <span>/</span>
            <span className="text-foreground">Parties</span>
          </nav>
          <h1 className="text-xl font-bold tracking-tight">Parties Master</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Customers &amp; Suppliers · {customerCount} customers · {supplierCount} suppliers
          </p>
        </div>
      </div>

      <PartiesClient
        entityId={entityId}
        parties={parties}
        accounts={accounts}
        taxCodes={taxCodes}
      />
    </div>
  );
}
