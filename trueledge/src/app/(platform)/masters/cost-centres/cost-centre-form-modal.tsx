"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createCostCentre,
  updateCostCentre,
  deleteCostCentre,
  toggleCostCentreStatus,
  createCostCentreDimension,
} from "@/lib/actions/cost-centres";
import { DIMENSION_TYPES, type CostCentreInput, type CostCentreDimensionInput } from "@/lib/validations/masters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface DimensionRow {
  id: string;
  entity_id: string;
  dimension_type: "project" | "department" | "location" | "activity" | "segment" | "custom";
  name: string;
  code: string;
  description: string | null;
  is_mandatory: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface CostCentreRow {
  id: string;
  entity_id: string;
  dimension_id: string;
  code: string;
  name: string;
  parent_id: string | null;
  level: number;
  is_group: boolean;
  is_active: boolean;
  budget: number | null;
  start_date: string | null;
  end_date: string | null;
}

interface CostCentreFormModalProps {
  entityId: string;
  mode: "create" | "edit" | "create_dimension";
  costCentre: CostCentreRow | null;
  dimensions: DimensionRow[];
  costCentres: CostCentreRow[];
  selectedDimensionId: string;
  onClose: () => void;
}

export function CostCentreFormModal({
  entityId,
  mode,
  costCentre,
  dimensions,
  costCentres,
  selectedDimensionId,
  onClose,
}: CostCentreFormModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Form for Cost Centre
  const [ccForm, setCcForm] = useState({
    dimension_id: costCentre?.dimension_id ?? selectedDimensionId ?? (dimensions[0]?.id || ""),
    code: costCentre?.code ?? "",
    name: costCentre?.name ?? "",
    parent_id: costCentre?.parent_id ?? "",
    is_group: costCentre?.is_group ?? false,
    budget: costCentre?.budget ? String(costCentre.budget) : "",
    start_date: costCentre?.start_date ?? "",
    end_date: costCentre?.end_date ?? "",
  });

  // Form for Dimension Creation
  const [dimForm, setDimForm] = useState({
    dimension_type: "department" as const,
    name: "",
    code: "",
    description: "",
    is_mandatory: false,
    sort_order: String(dimensions.length * 10 + 10),
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        formRef.current?.requestSubmit();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function submitDimension(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const payload: CostCentreDimensionInput = {
      entity_id: entityId,
      dimension_type: dimForm.dimension_type,
      name: dimForm.name,
      code: dimForm.code,
      description: dimForm.description || undefined,
      is_mandatory: dimForm.is_mandatory,
      sort_order: Number(dimForm.sort_order || 0),
    };

    startTransition(async () => {
      const res = await createCostCentreDimension(payload);
      if (!res.success) {
        setError(res.error ?? "Could not create dimension.");
        return;
      }
      router.refresh();
      onClose();
    });
  }

  function submitCostCentre(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const payload: CostCentreInput = {
      entity_id: entityId,
      dimension_id: ccForm.dimension_id,
      code: ccForm.code,
      name: ccForm.name,
      parent_id: ccForm.parent_id || null,
      is_group: ccForm.is_group,
      budget: ccForm.budget ? Number(ccForm.budget) : undefined,
      start_date: ccForm.start_date || undefined,
      end_date: ccForm.end_date || undefined,
    };

    startTransition(async () => {
      const res =
        mode === "edit" && costCentre
          ? await updateCostCentre(costCentre.id, payload)
          : await createCostCentre(payload);

      if (!res.success) {
        setError(res.error ?? "Could not save cost centre.");
        return;
      }
      router.refresh();
      onClose();
    });
  }

  function runToggleStatus() {
    if (!costCentre) return;
    startTransition(async () => {
      const res = await toggleCostCentreStatus(costCentre.id, !costCentre.is_active);
      if (!res.success) {
        setError(res.error ?? "Could not update status.");
        return;
      }
      router.refresh();
      onClose();
    });
  }

  function runDelete() {
    if (!costCentre) return;
    startTransition(async () => {
      const res = await deleteCostCentre(costCentre.id);
      if (!res.success) {
        setError(res.error ?? "Could not delete cost centre.");
        setConfirmDelete(false);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  if (mode === "create_dimension") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
        <div className="my-auto flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border bg-muted/20 px-6 py-4">
            <div>
              <h2 className="text-lg font-bold">New Dimension</h2>
              <p className="text-xs text-muted-foreground">
                Create a cost centre tracking dimension (e.g. Department, Project).
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>

          <form ref={formRef} onSubmit={submitDimension} className="flex-1 space-y-4 p-6">
            {error ? (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400">
                {error}
              </p>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="dim_type" className="text-xs font-medium">
                Dimension Type *
              </Label>
              <select
                id="dim_type"
                value={dimForm.dimension_type}
                onChange={(e) => setDimForm({ ...dimForm, dimension_type: e.target.value as any })}
                className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm"
              >
                {DIMENSION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="dim_code" className="text-xs font-medium">
                  Dimension Code *
                </Label>
                <Input
                  id="dim_code"
                  value={dimForm.code}
                  onChange={(e) => setDimForm({ ...dimForm, code: e.target.value })}
                  required
                  placeholder="e.g. DEPT"
                  className="h-9 font-mono text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dim_name" className="text-xs font-medium">
                  Dimension Name *
                </Label>
                <Input
                  id="dim_name"
                  value={dimForm.name}
                  onChange={(e) => setDimForm({ ...dimForm, name: e.target.value })}
                  required
                  placeholder="e.g. Department"
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dim_desc" className="text-xs font-medium">
                Description
              </Label>
              <Input
                id="dim_desc"
                value={dimForm.description}
                onChange={(e) => setDimForm({ ...dimForm, description: e.target.value })}
                placeholder="Optional description of this dimension"
                className="h-9 text-sm"
              />
            </div>
          </form>

          <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/20 px-6 py-4">
            <Button type="button" variant="outline" onClick={onClose} className="h-9 text-xs">
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => formRef.current?.requestSubmit()}
              disabled={isPending}
              className="h-9 bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              {isPending ? "Saving…" : "Save Dimension"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const groupOptions = costCentres.filter((c) => c.is_group && c.id !== costCentre?.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <div className="my-auto flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold">
              {mode === "edit" ? "Edit Cost Centre" : "Create Cost Centre"}
            </h2>
            <p className="text-xs text-muted-foreground">
              Define projects, departments, or cost allocation centres.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <form ref={formRef} onSubmit={submitCostCentre} className="flex-1 space-y-4 p-6">
          {error ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400">
              {error}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="cc_dim" className="text-xs font-medium">
              Dimension *
            </Label>
            <select
              id="cc_dim"
              value={ccForm.dimension_id}
              onChange={(e) => setCcForm({ ...ccForm, dimension_id: e.target.value })}
              className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm"
            >
              {dimensions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cc_code" className="text-xs font-medium">
                Cost Centre Code *
              </Label>
              <Input
                id="cc_code"
                value={ccForm.code}
                onChange={(e) => setCcForm({ ...ccForm, code: e.target.value })}
                autoFocus
                required
                placeholder="e.g. PRJ-DUBAI"
                className="h-9 font-mono text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cc_name" className="text-xs font-medium">
                Cost Centre Name *
              </Label>
              <Input
                id="cc_name"
                value={ccForm.name}
                onChange={(e) => setCcForm({ ...ccForm, name: e.target.value })}
                required
                placeholder="e.g. Dubai Office Tower"
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cc_parent" className="text-xs font-medium">
              Parent Cost Centre Group
            </Label>
            <select
              id="cc_parent"
              value={ccForm.parent_id}
              onChange={(e) => setCcForm({ ...ccForm, parent_id: e.target.value })}
              className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm"
            >
              <option value="">— Primary (Top level) —</option>
              {groupOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cc_budget" className="text-xs font-medium">
                Annual Budget (AED)
              </Label>
              <Input
                id="cc_budget"
                type="number"
                min="0"
                value={ccForm.budget}
                onChange={(e) => setCcForm({ ...ccForm, budget: e.target.value })}
                placeholder="0.00"
                className="h-9 font-mono text-sm text-right"
              />
            </div>

            <div className="flex items-center pt-6">
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={ccForm.is_group}
                  onChange={(e) => setCcForm({ ...ccForm, is_group: e.target.checked })}
                  className="h-3.5 w-3.5 cursor-pointer accent-emerald-600"
                />
                This is a Group / Parent Header
              </label>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="start_date" className="text-xs font-medium">
                Start Date
              </Label>
              <Input
                id="start_date"
                type="date"
                value={ccForm.start_date}
                onChange={(e) => setCcForm({ ...ccForm, start_date: e.target.value })}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="end_date" className="text-xs font-medium">
                End Date
              </Label>
              <Input
                id="end_date"
                type="date"
                value={ccForm.end_date}
                onChange={(e) => setCcForm({ ...ccForm, end_date: e.target.value })}
                className="h-9 text-sm"
              />
            </div>
          </div>
        </form>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/20 px-6 py-4">
          <div className="flex items-center gap-2">
            {mode === "edit" && costCentre ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={runToggleStatus}
                  disabled={isPending}
                  className="h-9 cursor-pointer text-xs"
                >
                  {costCentre.is_active ? "Deactivate" : "Reactivate"}
                </Button>

                {confirmDelete ? (
                  <Button
                    type="button"
                    onClick={runDelete}
                    disabled={isPending}
                    className="h-9 cursor-pointer bg-red-600 text-xs text-white hover:bg-red-700"
                  >
                    Confirm Delete
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfirmDelete(true)}
                    disabled={isPending}
                    className="h-9 cursor-pointer text-xs text-red-400"
                  >
                    Delete
                  </Button>
                )}
              </>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-9 cursor-pointer text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => formRef.current?.requestSubmit()}
              disabled={isPending}
              className="h-9 cursor-pointer bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              {isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
