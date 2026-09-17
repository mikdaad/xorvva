import { redirect } from "next/navigation";
import Link from "next/link";
import { requireActiveEntity } from "@/lib/entity-context";
import { getChartOfAccounts, getAccountGroups } from "@/lib/actions/accounts";
import { createClient } from "@/lib/supabase/server";
import { ChartOfAccountsClient } from "./coa-client";

export const metadata = {
  title: "Chart of Accounts | TrueLedge",
};

/**
 * Chart of Accounts — Tally's Group -> Sub-Group -> Ledger hierarchy.
 *
 * Requires an active company. Without one there is nothing to scope the chart
 * to, so the user is sent to the company selector rather than shown an empty
 * tree.
 */
export default async function ChartOfAccountsPage() {
  const entityId = await requireActiveEntity();

  if (!entityId) {
    redirect("/entities");
  }

  const supabase = await createClient();

  const [tree, groups, entityResult, taxCodesResult] = await Promise.all([
    getChartOfAccounts(entityId),
    getAccountGroups(entityId),
    supabase.from("entities").select("trade_name, base_currency").eq("id", entityId).maybeSingle(),
    supabase
      .from("tax_codes")
      .select("id, code, name, rate")
      .eq("entity_id", entityId)
      .eq("is_active", true)
      .order("code"),
  ]);

  const entity = entityResult.data;
  const taxCodes = (taxCodesResult.data ?? []) as {
    id: string;
    code: string;
    name: string;
    rate: number;
  }[];

  const ledgerCount = countNodes(tree, (n) => !n.is_group);
  const groupCount = countNodes(tree, (n) => n.is_group);

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
            <span className="text-foreground">Chart of Accounts</span>
          </nav>
          <h1 className="text-xl font-bold tracking-tight">Chart of Accounts</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {entity?.trade_name ?? "Company"} · {groupCount} groups · {ledgerCount} ledgers
          </p>
        </div>
      </div>

      <ChartOfAccountsClient
        entityId={entityId}
        tree={tree}
        groups={groups}
        taxCodes={taxCodes}
        baseCurrency={entity?.base_currency ?? "AED"}
      />
    </div>
  );
}

function countNodes(
  nodes: Awaited<ReturnType<typeof getChartOfAccounts>>,
  predicate: (n: { is_group: boolean }) => boolean
): number {
  let total = 0;
  for (const node of nodes) {
    if (predicate(node)) total += 1;
    total += countNodes(node.children, predicate);
  }
  return total;
}
