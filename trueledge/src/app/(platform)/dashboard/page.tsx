import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch entity IDs the user has access to, then fetch the entities
  const { data: entityAccess } = await supabase
    .from("entity_users")
    .select("entity_id")
    .eq("user_id", user?.id ?? "");

  const entityIds = entityAccess?.map((ea) => ea.entity_id) ?? [];

  const { data: entities } = entityIds.length > 0
    ? await supabase
        .from("entities")
        .select("id, trade_name, trn, entity_type, tax_treatment, base_currency, emirate")
        .in("id", entityIds)
    : { data: [] as { id: string; trade_name: string; trn: string | null; entity_type: string; tax_treatment: string; base_currency: string; emirate: string | null }[] };

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome back. Here&apos;s an overview of your accounts.
        </p>
      </div>

      {/* Quick stats row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Entities"
          value={(entities ?? []).length.toString()}
          description="Active companies"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-muted-foreground">
              <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
              <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
              <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
            </svg>
          }
        />
        <StatCard
          title="Open Periods"
          value="—"
          description="Current fiscal year"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-muted-foreground">
              <path d="M8 2v4" /><path d="M16 2v4" />
              <rect width="18" height="18" x="3" y="4" rx="2" />
              <path d="M3 10h18" />
            </svg>
          }
        />
        <StatCard
          title="Pending Invoices"
          value="—"
          description="Awaiting approval"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-muted-foreground">
              <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
              <path d="M8 10h8" /><path d="M8 14h4" />
            </svg>
          }
        />
        <StatCard
          title="VAT Due"
          value="—"
          description="Next filing date"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-muted-foreground">
              <line x1="19" x2="5" y1="5" y2="19" />
              <circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" />
            </svg>
          }
        />
      </div>

      {/* Entities list */}
      {(entities ?? []).length > 0 ? (
        <div>
          <h2 className="text-lg font-semibold mb-4">Your Entities</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {(entities ?? []).map((entity) => (
              <Card
                key={entity.id}
                className="hover:border-emerald-500/30 transition-colors cursor-pointer"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold">
                      {entity.trade_name}
                    </CardTitle>
                    <Badge variant="secondary" className="text-xs">
                      {entity.entity_type?.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    {entity.emirate} • {entity.base_currency}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">TRN</span>
                    <span className="font-mono text-xs">
                      {entity.trn || "Not set"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Tax Treatment</span>
                    <Badge variant="outline" className="text-xs capitalize">
                      {entity.tax_treatment?.replace(/_/g, " ")}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-muted-foreground">
                <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
                <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
                <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold">No entities yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Add your first company or client entity to start managing their
              books. Go to Settings → Entities.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Quick actions */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: "New Invoice",
              description: "Create a sales invoice",
              href: "/transactions/sales-invoice",
            },
            {
              label: "Journal Entry",
              description: "Record a manual entry",
              href: "/transactions/new?type=journal_voucher",
            },
            {
              label: "Bank Import",
              description: "Upload bank statement",
              href: "/banking/import",
            },
            {
              label: "VAT Return",
              description: "Prepare FTA submission",
              href: "/reports/vat-return",
            },
          ].map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="group flex flex-col items-start gap-1 rounded-xl border border-border bg-card p-4 text-left hover:border-emerald-500/30 hover:bg-card/80 transition-all"
            >
              <span className="text-sm font-semibold text-foreground group-hover:text-emerald-400 transition-colors">
                {action.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {action.description}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper Components
// ---------------------------------------------------------------------------

function StatCard({
  title,
  value,
  description,
  icon,
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}
