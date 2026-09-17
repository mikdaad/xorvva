"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "All Vouchers", href: "/transactions" },
  { label: "Sales Invoices", href: "/transactions/sales-invoice" },
  { label: "Purchase Bills", href: "/transactions/purchase-bill" },
] as const;

export default function TransactionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground mt-1">
            Manage vouchers, invoices, bills, and journal entries.
          </p>
        </div>

        {/* New voucher dropdown */}
        <div className="flex items-center gap-2">
          <Link
            href="/transactions/sales-invoice"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            New Invoice
          </Link>
          <Link
            href="/transactions/purchase-bill"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            New Bill
          </Link>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="border-b border-border">
        <nav className="-mb-px flex gap-6" aria-label="Transaction tabs">
          {TABS.map((tab) => {
            const isActive =
              tab.href === "/transactions"
                ? pathname === "/transactions"
                : pathname.startsWith(tab.href);

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`inline-flex items-center border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-emerald-500 text-emerald-400"
                    : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Page content */}
      {children}
    </div>
  );
}
