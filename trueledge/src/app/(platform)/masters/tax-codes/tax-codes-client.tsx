"use client";

import { useMemo, useState } from "react";
import { TaxCodeFormModal, type TaxCodeRow, type AccountOption } from "./tax-code-form-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface TaxCodesClientProps {
  entityId: string;
  taxCodes: TaxCodeRow[];
  accounts: AccountOption[];
}

export function TaxCodesClient({ entityId, taxCodes, accounts }: TaxCodesClientProps) {
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [modalState, setModalState] = useState<{
    open: boolean;
    mode: "create" | "edit";
    taxCode: TaxCodeRow | null;
  }>({ open: false, mode: "create", taxCode: null });

  const query = search.trim().toLowerCase();

  const filteredTaxCodes = useMemo(() => {
    return taxCodes.filter((tc) => {
      if (!showInactive && !tc.is_active) return false;

      if (!query) return true;
      return (
        tc.code.toLowerCase().includes(query) ||
        tc.name.toLowerCase().includes(query) ||
        (tc.fta_code ?? "").toLowerCase().includes(query)
      );
    });
  }, [taxCodes, query, showInactive]);

  function openCreate() {
    setModalState({ open: true, mode: "create", taxCode: null });
  }

  function openEdit(taxCode: TaxCodeRow) {
    setModalState({ open: true, mode: "edit", taxCode });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code, name, or FTA box…"
            className="h-9 w-full max-w-xs text-sm"
          />

          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer accent-emerald-600"
            />
            Show inactive
          </label>
        </div>

        <Button
          onClick={openCreate}
          className="h-9 cursor-pointer bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          + Add Tax Code
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-10 bg-muted/40 backdrop-blur">
            <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="px-6 py-2.5">Code</th>
              <th className="px-3 py-2.5">Tax Name</th>
              <th className="px-3 py-2.5 text-right">Rate (%)</th>
              <th className="px-3 py-2.5">Scope</th>
              <th className="px-3 py-2.5">FTA Box</th>
              <th className="px-3 py-2.5">Default</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-6 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filteredTaxCodes.map((tc) => (
              <tr
                key={tc.id}
                className={`group transition-colors hover:bg-muted/30 ${
                  tc.is_active ? "" : "opacity-50"
                }`}
              >
                <td className="px-6 py-3 font-mono text-xs font-semibold text-foreground">
                  {tc.code}
                </td>
                <td className="px-3 py-3 font-medium text-sm text-foreground">{tc.name}</td>
                <td className="px-3 py-3 text-right font-mono text-xs font-bold text-emerald-400">
                  {tc.rate}%
                </td>
                <td className="px-3 py-3">
                  <Badge variant="outline" className="uppercase text-[10px]">
                    {tc.tax_scope}
                  </Badge>
                </td>
                <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                  {tc.fta_code ?? "—"}
                </td>
                <td className="px-3 py-3 text-xs">
                  {tc.is_default ? (
                    <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                      DEFAULT
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-3 text-xs">
                  {tc.is_active ? (
                    <span className="text-[10px] font-medium text-emerald-400">Active</span>
                  ) : (
                    <span className="text-[10px] font-medium text-muted-foreground">Inactive</span>
                  )}
                </td>
                <td className="px-6 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => openEdit(tc)}
                    className="cursor-pointer rounded px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredTaxCodes.length === 0 ? (
          <div className="p-16 text-center">
            <h3 className="text-sm font-bold">No tax codes found</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Click &quot;+ Add Tax Code&quot; to configure custom VAT or Corporate Tax rules.
            </p>
          </div>
        ) : null}
      </div>

      {modalState.open ? (
        <TaxCodeFormModal
          entityId={entityId}
          mode={modalState.mode}
          taxCode={modalState.taxCode}
          accounts={accounts}
          onClose={() => setModalState({ open: false, mode: "create", taxCode: null })}
        />
      ) : null}
    </div>
  );
}
