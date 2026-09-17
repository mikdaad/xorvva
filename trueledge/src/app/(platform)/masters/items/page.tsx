import { redirect } from "next/navigation";
import Link from "next/link";
import { requireActiveEntity } from "@/lib/entity-context";
import { getItems } from "@/lib/actions/items";
import { getTaxCodes } from "@/lib/actions/tax-codes";
import { createClient } from "@/lib/supabase/server";
import { ItemsClient } from "./items-client";

export const metadata = {
  title: "Items Master | TrueLedge",
};

export default async function ItemsPage() {
  const entityId = await requireActiveEntity();

  if (!entityId) {
    redirect("/entities");
  }

  const supabase = await createClient();

  const [items, taxCodes, accountsResult] = await Promise.all([
    getItems(entityId),
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

  const inventoryCount = items.filter((i) => i.item_type === "inventory").length;
  const serviceCount = items.filter((i) => i.item_type === "service").length;

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
            <span className="text-foreground">Items</span>
          </nav>
          <h1 className="text-xl font-bold tracking-tight">Items Master</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Products &amp; Services · {items.length} total items ({inventoryCount} inventory, {serviceCount} services)
          </p>
        </div>
      </div>

      <ItemsClient
        entityId={entityId}
        items={items}
        accounts={accounts}
        taxCodes={taxCodes}
      />
    </div>
  );
}
