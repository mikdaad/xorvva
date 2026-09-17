"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Accounts", href: "/banking" },
  { label: "Import Statement", href: "/banking/import" },
] as const;

export default function BankingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Banking</h1>
        <p className="text-muted-foreground mt-1">
          Manage bank accounts, import statements, and reconcile transactions.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="-mb-px flex gap-6" aria-label="Banking tabs">
          {TABS.map((tab) => {
            const isActive =
              tab.href === "/banking"
                ? pathname === "/banking"
                : pathname.startsWith(tab.href);

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`inline-flex items-center border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-sky-500 text-sky-400"
                    : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {children}
    </div>
  );
}
