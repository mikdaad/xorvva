import { redirect } from "next/navigation";
import Link from "next/link";
import { requireActiveEntity } from "@/lib/entity-context";
import { getCostCentreDimensions, getCostCentres } from "@/lib/actions/cost-centres";
import { CostCentresClient } from "./cost-centres-client";

export const metadata = {
  title: "Cost Centres Master | TrueLedge",
};

export default async function CostCentresPage() {
  const entityId = await requireActiveEntity();

  if (!entityId) {
    redirect("/entities");
  }

  const [dimensions, costCentres] = await Promise.all([
    getCostCentreDimensions(entityId),
    getCostCentres(entityId),
  ]);

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
            <span className="text-foreground">Cost Centres</span>
          </nav>
          <h1 className="text-xl font-bold tracking-tight">Cost Centres Master</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Projects, Departments &amp; Cost Tracking Dimensions · {costCentres.length} cost centres across {dimensions.length} dimensions
          </p>
        </div>
      </div>

      <CostCentresClient
        entityId={entityId}
        dimensions={dimensions}
        costCentres={costCentres}
      />
    </div>
  );
}
