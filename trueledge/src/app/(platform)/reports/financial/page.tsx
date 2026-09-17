import { redirect } from "next/navigation";
import Link from "next/link";
import { requireActiveEntity } from "@/lib/entity-context";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Financial Reports | TrueLedge",
};

export default async function FinancialReportsPage() {
  const entityId = await requireActiveEntity();
  if (!entityId) {
    redirect("/entities");
  }

  const supabase = await createClient();

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, code, name, account_type, is_group")
    .eq("entity_id", entityId)
    .eq("is_active", true)
    .order("code");

  const totalAccounts = accounts?.length ?? 0;

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
          <span className="text-foreground">Financial Reports</span>
        </nav>
        <h1 className="text-xl font-bold tracking-tight">Financial Statements &amp; Reports</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Trial Balance, Profit &amp; Loss, Balance Sheet, and General Ledger reports ({totalAccounts} accounts mapped)
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:border-emerald-500/30">
          <div>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18" />
                <path d="M18 17V9" />
                <path d="M13 17V5" />
                <path d="M8 17v-3" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-foreground">Trial Balance</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Summary of all debit and credit balances across your Chart of Accounts for a specified period.
            </p>
          </div>
          <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4 text-xs">
            <span className="font-medium text-emerald-400">Balanced Ledger</span>
            <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px]">Period-to-Date</span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:border-emerald-500/30">
          <div>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" x2="12" y1="2" y2="22" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-foreground">Profit &amp; Loss (Income Statement)</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Revenue, Cost of Goods Sold, Operating Expenses, and Net Profit calculated under IFRS rules.
            </p>
          </div>
          <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4 text-xs">
            <span className="font-medium text-blue-400">Accrual Basis</span>
            <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px]">Monthly / YTD</span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:border-emerald-500/30">
          <div>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M3 9h18" />
                <path d="M9 21V9" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-foreground">Balance Sheet</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Assets, Liabilities, and Equity position statement as of selected closing date.
            </p>
          </div>
          <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4 text-xs">
            <span className="font-medium text-purple-400">Assets = L + E</span>
            <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px]">As of Date</span>
          </div>
        </div>
      </div>
    </div>
  );
}
