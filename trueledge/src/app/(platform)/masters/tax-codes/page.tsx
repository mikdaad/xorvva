import { redirect } from "next/navigation";
import Link from "next/link";
import { requireActiveEntity } from "@/lib/entity-context";
import { getTaxCodes } from "@/lib/actions/tax-codes";
import { createClient } from "@/lib/supabase/server";
import { TaxCodesClient } from "./tax-codes-client";

export const metadata = {
  title: "Tax Codes Master | TrueLedge",
};

export default async function TaxCodesPage() {
  const entityId = await requireActiveEntity();

  if (!entityId) {
    redirect("/entities");
  }

  const supabase = await createClient();

  const [taxCodes, accountsResult] = await Promise.all([
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
            <span className="text-foreground">Tax Codes</span>
          </nav>
          <h1 className="text-xl font-bold tracking-tight">Tax Codes Master</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            UAE VAT &amp; Tax Classification Rules · {taxCodes.length} active tax codes
          </p>
        </div>
      </div>

      <TaxCodesClient
        entityId={entityId}
        taxCodes={taxCodes}
        accounts={accounts}
      />
    </div>
  );
}
