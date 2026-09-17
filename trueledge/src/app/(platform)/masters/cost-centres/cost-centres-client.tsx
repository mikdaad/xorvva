"use client";

import { useMemo, useState } from "react";
import { CostCentreFormModal, type CostCentreRow, type DimensionRow } from "./cost-centre-form-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface CostCentresClientProps {
  entityId: string;
  dimensions: DimensionRow[];
  costCentres: CostCentreRow[];
}

export function CostCentresClient({ entityId, dimensions, costCentres }: CostCentresClientProps) {
  const [search, setSearch] = useState("");
  const [selectedDimensionId, setSelectedDimensionId] = useState<string>(
    dimensions[0]?.id ?? ""
  );
  const [showInactive, setShowInactive] = useState(false);
  const [modalState, setModalState] = useState<{
    open: boolean;
    mode: "create" | "edit" | "create_dimension";
    costCentre: CostCentreRow | null;
  }>({ open: false, mode: "create", costCentre: null });

  const query = search.trim().toLowerCase();

  const filteredCostCentres = useMemo(() => {
    return costCentres.filter((cc) => {
      if (!showInactive && !cc.is_active) return false;
      if (selectedDimensionId && cc.dimension_id !== selectedDimensionId) return false;

      if (!query) return true;
      return cc.name.toLowerCase().includes(query) || cc.code.toLowerCase().includes(query);
    });
  }, [costCentres, query, selectedDimensionId, showInactive]);

  function openCreate() {
    setModalState({ open: true, mode: "create", costCentre: null });
  }

  function openCreateDimension() {
    setModalState({ open: true, mode: "create_dimension", costCentre: null });
  }

  function openEdit(costCentre: CostCentreRow) {
    setModalState({ open: true, mode: "edit", costCentre });
  }

  const selectedDimension = dimensions.find((d) => d.id === selectedDimensionId);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cost centres by code or name…"
            className="h-9 w-full max-w-xs text-sm"
          />

          <div className="flex items-center rounded-lg border border-border bg-muted/20 p-1 overflow-x-auto">
            {dimensions.map((dim) => (
              <button
                key={dim.id}
                onClick={() => setSelectedDimensionId(dim.id)}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  selectedDimensionId === dim.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {dim.name}
              </button>
            ))}
          </div>

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

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={openCreateDimension}
            className="h-9 cursor-pointer text-xs"
          >
            + New Dimension
          </Button>
          <Button
            onClick={openCreate}
            className="h-9 cursor-pointer bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            + Add Cost Centre
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-10 bg-muted/40 backdrop-blur">
            <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="px-6 py-2.5">Code</th>
              <th className="px-3 py-2.5">Cost Centre Name</th>
              <th className="px-3 py-2.5">Dimension</th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5 text-right">Annual Budget</th>
              <th className="px-3 py-2.5">Dates</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-6 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filteredCostCentres.map((cc) => (
              <tr
                key={cc.id}
                className={`group transition-colors hover:bg-muted/30 ${
                  cc.is_active ? "" : "opacity-50"
                }`}
              >
                <td className="px-6 py-3 font-mono text-xs font-semibold text-foreground">
                  {cc.code}
                </td>
                <td className="px-3 py-3 font-medium text-sm text-foreground">{cc.name}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground">
                  {selectedDimension?.name ?? "General"}
                </td>
                <td className="px-3 py-3">
                  {cc.is_group ? (
                    <Badge variant="secondary" className="text-[10px] uppercase font-bold">
                      Group
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      Centre
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-3 text-right font-mono text-xs">
                  {cc.budget ? `AED ${cc.budget.toLocaleString()}` : "—"}
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">
                  {cc.start_date || cc.end_date ? (
                    <span>
                      {cc.start_date ?? "—"} to {cc.end_date ?? "Ongoing"}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-3 text-xs">
                  {cc.is_active ? (
                    <span className="text-[10px] font-medium text-emerald-400">Active</span>
                  ) : (
                    <span className="text-[10px] font-medium text-muted-foreground">Inactive</span>
                  )}
                </td>
                <td className="px-6 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => openEdit(cc)}
                    className="cursor-pointer rounded px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredCostCentres.length === 0 ? (
          <div className="p-16 text-center">
            <h3 className="text-sm font-bold">No cost centres found</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Select a different dimension or click &quot;+ Add Cost Centre&quot; to define a project or department.
            </p>
          </div>
        ) : null}
      </div>

      {modalState.open ? (
        <CostCentreFormModal
          entityId={entityId}
          mode={modalState.mode}
          costCentre={modalState.costCentre}
          dimensions={dimensions}
          costCentres={costCentres}
          selectedDimensionId={selectedDimensionId}
          onClose={() => setModalState({ open: false, mode: "create", costCentre: null })}
        />
      ) : null}
    </div>
  );
}
