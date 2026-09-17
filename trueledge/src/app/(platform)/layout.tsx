import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveEntityId } from "@/lib/entity-context";
import { EntitySwitcher, type SwitcherEntity } from "@/components/entity-switcher";
import { NavItem } from "@/components/nav-item";

/**
 * Platform layout — wraps all authenticated pages with a sidebar + topbar.
 * Checks auth state and redirects unauthenticated users.
 */
export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch user profile
  const { data: profile } = await supabase
    .from("users")
    .select("full_name, email, avatar_url")
    .eq("id", user.id)
    .single();

  const displayName = profile?.full_name || user.email || "User";
  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Companies this user can switch between, for the F1 palette. RLS already
  // limits entities to the caller's memberships, so no extra filter is needed
  // beyond joining through entity_users.
  const activeEntityId = await getActiveEntityId();

  const { data: entityUsers } = await supabase
    .from("entity_users")
    .select("entity_id")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const accessibleIds = entityUsers?.map((eu) => eu.entity_id) ?? [];

  const { data: switcherRows } = accessibleIds.length
    ? await supabase
        .from("entities")
        .select("id, trade_name, trn")
        .in("id", accessibleIds)
        .eq("is_active", true)
        .order("trade_name")
    : { data: [] };

  const switcherEntities = (switcherRows ?? []) as SwitcherEntity[];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col border-r border-border bg-sidebar">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 px-6 border-b border-border">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 border border-emerald-500/30">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 text-emerald-400"
            >
              <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
              <path d="M8 10h8" />
              <path d="M8 14h4" />
            </svg>
          </div>
          <span className="text-sm font-bold tracking-tight text-sidebar-foreground">
            TrueLedge
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <NavSection title="Overview">
            <NavItem href="/dashboard" icon="layout-dashboard" label="Dashboard" />
            <NavItem href="/entities" icon="building-2" label="Select Company" />
          </NavSection>

          <NavSection title="Accounting">
            <NavItem href="/transactions" icon="receipt" label="Transactions" />
            <NavItem href="/transactions/sales-invoice" icon="file-plus-2" label="Sales Invoice" />
            <NavItem href="/transactions/purchase-bill" icon="file-minus-2" label="Purchase Bill" />
            <NavItem href="/transactions/new?type=journal_voucher" icon="book-open" label="Journal Entries" />
          </NavSection>

          <NavSection title="Banking">
            <NavItem href="/banking" icon="landmark" label="Bank Accounts" />
            <NavItem href="/banking/import" icon="upload" label="Import Statement" />
          </NavSection>

          <NavSection title="AI Inbox">
            <NavItem href="/inbox" icon="scan" label="Document Inbox" />
          </NavSection>

          <NavSection title="Masters">
            <NavItem href="/masters/chart-of-accounts" icon="list-tree" label="Chart of Accounts" />
            <NavItem href="/masters/parties" icon="users" label="Parties" />
            <NavItem href="/masters/items" icon="package" label="Items" />
            <NavItem href="/masters/cost-centres" icon="target" label="Cost Centres" />
            <NavItem href="/masters/tax-codes" icon="percent" label="Tax Codes" />
          </NavSection>

          <NavSection title="Reports">
            <NavItem href="/reports/financial" icon="bar-chart-3" label="Financial Reports" />
            <NavItem href="/reports/vat-return" icon="file-badge" label="VAT Return" />
            <NavItem href="/reports/audit-trail" icon="shield-check" label="Audit Trail" />
          </NavSection>
        </nav>

        {/* User footer */}
        <div className="border-t border-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600/20 text-xs font-semibold text-emerald-400">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {displayName}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user.email}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b border-border px-6">
          {/* Mobile menu button */}
          <button className="lg:hidden p-2 text-muted-foreground hover:text-foreground">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <line x1="4" x2="20" y1="12" y2="12" />
              <line x1="4" x2="20" y1="6" y2="6" />
              <line x1="4" x2="20" y1="18" y2="18" />
            </svg>
          </button>

          <div className="hidden lg:block" />

          <div className="flex items-center gap-4">
            {/* Tally F1: Select / Switch Company */}
            <div className="hidden sm:block">
              <EntitySwitcher entities={switcherEntities} activeEntityId={activeEntityId} />
            </div>

            {/* Notifications */}
            <button className="relative p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50 transition-colors">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
            </button>

            {/* Settings */}
            <button className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50 transition-colors">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-auto p-6">{children}</div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper Components
// ---------------------------------------------------------------------------

function NavSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pt-4 first:pt-0">
      <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
        {title}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
