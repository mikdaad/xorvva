import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EntitiesClient } from "./entities-client";
import type { CompanyRow } from "./company-grid";

/**
 * Returns the UAE VAT quarter label for a date, e.g. "Q3 2026".
 *
 * The FTA assigns quarterly VAT periods to most registrants; this is the
 * calendar-quarter default. Entities on monthly or staggered FTA periods are
 * not represented here — that mapping needs the entity's actual FTA filing
 * schedule, which we do not yet capture.
 */
function vatQuarterLabel(date: Date): string {
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `Q${quarter} ${date.getUTCFullYear()}`;
}

interface EntityRecord {
  id: string;
  organisation_id: string;
  trade_name: string;
  legal_name: string | null;
  trn: string | null;
  entity_type: string;
  tax_treatment: string;
  emirate: string | null;
  base_currency: string;
  is_free_zone: boolean | null;
  free_zone_name: string | null;
  is_active: boolean;
  created_at: string;
  fiscal_years?: { name: string; start_date: string; end_date: string }[] | null;
}

interface PeriodRecord {
  entity_id: string;
  name: string;
  end_date: string;
  status: string;
}

export default async function EntitiesDashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: orgUser } = await supabase
    .from("organisation_users")
    .select("organisation_id, organisations(id, name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!orgUser?.organisation_id || !orgUser.organisations) {
    redirect("/onboarding");
  }

  const organisation = orgUser.organisations as unknown as { id: string; name: string };

  const { data: entityUsers } = await supabase
    .from("entity_users")
    .select("entity_id")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const entityIds = entityUsers?.map((eu) => eu.entity_id) ?? [];

  if (entityIds.length === 0) {
    return (
      <EntitiesClient
        organisationId={organisation.id}
        organisationName={organisation.name}
        companies={[]}
      />
    );
  }

  // Entities and their closed periods, fetched in parallel — neither depends on
  // the other and both are already constrained to entityIds.
  const [entitiesResult, periodsResult] = await Promise.all([
    supabase
      .from("entities")
      .select(
        `id, organisation_id, trade_name, legal_name, trn, entity_type, tax_treatment,
         emirate, base_currency, is_free_zone, free_zone_name, is_active, created_at,
         fiscal_years ( name, start_date, end_date )`
      )
      .in("id", entityIds)
      .order("trade_name"),
    supabase
      .from("periods")
      .select("entity_id, name, end_date, status")
      .in("entity_id", entityIds)
      .neq("status", "open")
      .order("end_date", { ascending: false }),
  ]);

  const rawEntities = (entitiesResult.data ?? []) as unknown as EntityRecord[];
  const rawPeriods = (periodsResult.data ?? []) as unknown as PeriodRecord[];

  // Periods arrive newest-first, so the first hit per entity is the latest
  // closed one.
  const lastClosedByEntity = new Map<string, string>();
  for (const period of rawPeriods) {
    if (!lastClosedByEntity.has(period.entity_id)) {
      lastClosedByEntity.set(period.entity_id, period.name);
    }
  }

  const currentVatQuarter = vatQuarterLabel(new Date());

  const companies: CompanyRow[] = rawEntities.map((ent) => ({
    id: ent.id,
    trade_name: ent.trade_name,
    legal_name: ent.legal_name,
    trn: ent.trn,
    base_currency: ent.base_currency,
    emirate: ent.emirate,
    entity_type: ent.entity_type,
    tax_treatment: ent.tax_treatment,
    is_free_zone: ent.is_free_zone ?? ent.entity_type === "free_zone",
    free_zone_name: ent.free_zone_name,
    is_active: ent.is_active,
    fiscal_year_name: ent.fiscal_years?.[0]?.name ?? null,
    last_closed_period: lastClosedByEntity.get(ent.id) ?? null,
    vat_quarter: ent.tax_treatment === "registered" ? currentVatQuarter : null,
  }));

  return (
    <EntitiesClient
      organisationId={organisation.id}
      organisationName={organisation.name}
      companies={companies}
    />
  );
}
