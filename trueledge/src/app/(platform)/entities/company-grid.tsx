"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { switchEntityAction } from "@/lib/actions/entity-session";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

/**
 * Tally's "Select Company" grid.
 *
 * Keyboard model mirrors Tally's company list:
 *   ↑ / ↓    move the highlighted row
 *   Enter    open the highlighted company
 *   /        focus the search box
 *   Esc      clear search / blur
 *
 * The row highlight is deliberately independent of DOM focus so arrow keys keep
 * working while the search box holds focus — that is how an accountant filters
 * then selects without touching the mouse.
 */

export interface CompanyRow {
  id: string;
  trade_name: string;
  legal_name: string | null;
  trn: string | null;
  base_currency: string;
  emirate: string | null;
  entity_type: string;
  tax_treatment: string;
  is_free_zone: boolean;
  free_zone_name: string | null;
  is_active: boolean;
  /** Latest fiscal year label, e.g. "FY 2026". */
  fiscal_year_name: string | null;
  /** Name of the most recently closed period, or null when none are closed. */
  last_closed_period: string | null;
  /** Current UAE VAT quarter label, e.g. "Q3 2026". */
  vat_quarter: string | null;
}

const features = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
});

const helper = createColumnHelper<typeof features, CompanyRow>();

// Module scope: a fresh fallback array each render would invalidate the row model.
const EMPTY_ROWS: CompanyRow[] = [];

const columns = helper.columns([
  helper.accessor("trade_name", {
    header: "Company / Trade Name",
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 shrink-0 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-sm font-bold text-emerald-400 flex items-center justify-center">
          {row.original.trade_name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">
            {row.original.trade_name}
          </p>
          {row.original.legal_name ? (
            <p className="max-w-xs truncate text-xs text-muted-foreground">
              {row.original.legal_name}
            </p>
          ) : null}
        </div>
      </div>
    ),
  }),
  helper.accessor("trn", {
    header: "FTA TRN",
    cell: ({ row }) =>
      row.original.trn ? (
        <div className="space-y-1">
          <span className="font-mono text-xs font-semibold">{row.original.trn}</span>
          <div>
            <Badge className="border-emerald-500/30 bg-emerald-500/15 text-[10px] font-medium text-emerald-400">
              VAT Registered
            </Badge>
          </div>
        </div>
      ) : (
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          {row.original.tax_treatment.replace(/_/g, " ").toUpperCase()}
        </Badge>
      ),
  }),
  helper.accessor("base_currency", {
    header: "Currency",
    cell: ({ row }) => (
      <span className="font-mono text-xs font-semibold">{row.original.base_currency}</span>
    ),
  }),
  helper.accessor("last_closed_period", {
    header: "Last Closed Period",
    cell: ({ row }) =>
      row.original.last_closed_period ? (
        <span className="text-xs font-medium">{row.original.last_closed_period}</span>
      ) : (
        <span className="text-xs text-muted-foreground">— none closed —</span>
      ),
  }),
  helper.accessor("vat_quarter", {
    header: "VAT Quarter",
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.vat_quarter ?? "—"}</span>
    ),
  }),
  helper.accessor("is_active", {
    header: "Status",
    cell: ({ row }) =>
      row.original.is_active ? (
        <span className="inline-flex items-center text-[10px] font-medium text-emerald-400">
          <span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Open
        </span>
      ) : (
        <span className="text-[10px] font-medium text-muted-foreground">Closed</span>
      ),
  }),
]);

interface CompanyGridProps {
  companies: CompanyRow[];
  onRequestCreate: () => void;
}

export function CompanyGrid({ companies, onRequestCreate }: CompanyGridProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [globalFilter, setGlobalFilter] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  const table = useTable({
    features,
    columns,
    data: companies ?? EMPTY_ROWS,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
  });

  const rows = table.getRowModel().rows;

  // Keep the highlight inside the filtered result set as the user types.
  useEffect(() => {
    setActiveIndex((current) => (rows.length === 0 ? 0 : Math.min(current, rows.length - 1)));
  }, [rows.length]);

  const openCompany = useMemo(
    () => (entityId: string) => {
      setError(null);
      startTransition(async () => {
        const res = await switchEntityAction(entityId);
        if (res && !res.success) {
          setError(res.error ?? "Could not open that company.");
          return;
        }
        router.push("/dashboard");
        router.refresh();
      });
    },
    [router]
  );

  // Window-level so arrow keys work regardless of which control holds focus.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typingInInput =
        target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

      if (event.key === "F3") {
        event.preventDefault();
        onRequestCreate();
        return;
      }

      if (event.key === "/" && !typingInInput) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }

      if (event.key === "Escape" && typingInInput) {
        setGlobalFilter("");
        (target as HTMLInputElement).blur();
        return;
      }

      if (rows.length === 0) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, rows.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (event.key === "Enter") {
        // Enter inside the search box should open the highlighted row, which is
        // what Tally does — so this is intentionally not gated on typingInInput.
        event.preventDefault();
        const row = rows[activeIndex];
        if (row) openCompany(row.original.id);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [rows, activeIndex, openCompany, onRequestCreate]);

  // Keep the highlighted row visible during keyboard navigation.
  useEffect(() => {
    rowRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-96">
          <Input
            ref={searchRef}
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search name, TRN, emirate…   (press / )"
            className="h-10 border-border bg-card pl-3"
            aria-label="Search companies"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          <kbd className="rounded border border-border px-1">↑</kbd>{" "}
          <kbd className="rounded border border-border px-1">↓</kbd> navigate ·{" "}
          <kbd className="rounded border border-border px-1">Enter</kbd> open ·{" "}
          <kbd className="rounded border border-border px-1">F3</kbd> create
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr
                  key={group.id}
                  className="border-b border-border bg-muted/20 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                >
                  {group.headers.map((header) => (
                    <th key={header.id} className="px-4 py-3">
                      {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row, index) => (
                <tr
                  key={row.id}
                  ref={(el) => {
                    rowRefs.current[index] = el;
                  }}
                  onClick={() => {
                    setActiveIndex(index);
                    openCompany(row.original.id);
                  }}
                  aria-selected={index === activeIndex}
                  className={`cursor-pointer transition-colors ${
                    index === activeIndex
                      ? "bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/40"
                      : "hover:bg-muted/30"
                  } ${isPending ? "opacity-60" : ""}`}
                >
                  {row.getAllCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-4 align-middle">
                      <table.FlexRender cell={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rows.length === 0 ? (
          <div className="space-y-2 p-12 text-center">
            <h3 className="text-base font-bold">No matching companies</h3>
            <p className="mx-auto max-w-sm text-xs text-muted-foreground">
              {globalFilter
                ? "No company matches your search. Clear the filter or press F3 to create one."
                : "Press F3 to create your first company."}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
