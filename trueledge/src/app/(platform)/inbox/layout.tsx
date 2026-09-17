"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isDetailPage = pathname !== "/inbox";

  return (
    <div className="space-y-6">
      {/* Header — hide on detail pages for full-width split view */}
      {!isDetailPage && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Document Inbox</h1>
            <p className="text-muted-foreground mt-1">
              Upload invoices and receipts for AI-powered data extraction.
            </p>
          </div>

          {/* AI badge */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-400">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                <path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" />
              </svg>
              Gemini AI
            </span>
          </div>
        </div>
      )}

      {/* Breadcrumb on detail pages */}
      {isDetailPage && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/inbox" className="hover:text-foreground transition-colors">
            ← Back to Inbox
          </Link>
        </div>
      )}

      {children}
    </div>
  );
}
