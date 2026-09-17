"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTaxCode, updateTaxCode, deleteTaxCode, toggleTaxCodeStatus } from "@/lib/actions/tax-codes";
import { TAX_SCOPES, type TaxCodeInput } from "@/lib/validations/masters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface AccountOption {
  id: string;
  name: string;
}

export interface TaxCodeRow {
  id: string;
  entity_id: string;
  code: string;
  name: string;
  rate: number;
  tax_scope: "vat" | "corporate_tax" | "excise" | "withholding";
  fta_code: string | null;
  account_id: string | null;
  output_account_id: string | null;
  input_account_id: string | null;
  is_default: boolean;
  is_active: boolean;
}

interface TaxCodeFormModalProps {
  entityId: string;
  mode: "create" | "edit";
  taxCode: TaxCodeRow | null;
  accounts: AccountOption[];
  onClose: () => void;
}

export function TaxCodeFormModal({
  entityId,
  mode,
  taxCode,
  accounts,
  onClose,
}: TaxCodeFormModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const [form, setForm] = useState({
    code: taxCode?.code ?? "",
    name: taxCode?.name ?? "",
    rate: taxCode?.rate !== undefined ? String(taxCode.rate) : "5",
    tax_scope: taxCode?.tax_scope ?? ("vat" as const),
    fta_code: taxCode?.fta_code ?? "",
    output_account_id: taxCode?.output_account_id ?? "",
    input_account_id: taxCode?.input_account_id ?? "",
    is_default: taxCode?.is_default ?? false,
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

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const payload: TaxCodeInput = {
      entity_id: entityId,
      code: form.code,
      name: form.name,
      rate: Number(form.rate || 0),
      tax_scope: form.tax_scope,
      fta_code: form.fta_code || undefined,
      output_account_id: form.output_account_id || null,
      input_account_id: form.input_account_id || null,
      is_default: form.is_default,
    };

    startTransition(async () => {
      const res =
        mode === "edit" && taxCode
          ? await updateTaxCode(taxCode.id, payload)
          : await createTaxCode(payload);

      if (!res.success) {
        setError(res.error ?? "Could not save tax code.");
        return;
      }
      router.refresh();
      onClose();
    });
  }

  function runToggleStatus() {
    if (!taxCode) return;
    startTransition(async () => {
      const res = await toggleTaxCodeStatus(taxCode.id, !taxCode.is_active);
      if (!res.success) {
        setError(res.error ?? "Could not update status.");
        return;
      }
      router.refresh();
      onClose();
    });
  }

  function runDelete() {
    if (!taxCode) return;
    startTransition(async () => {
      const res = await deleteTaxCode(taxCode.id);
      if (!res.success) {
        setError(res.error ?? "Could not delete tax code.");
        setConfirmDelete(false);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <div className="my-auto flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold">
              {mode === "edit" ? "Edit Tax Code" : "Create Tax Code"}
            </h2>
            <p className="text-xs text-muted-foreground">
              Define VAT rates, FTA tax codes, and general ledger tax mappings.
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

        <form ref={formRef} onSubmit={submit} className="flex-1 space-y-4 p-6">
          {error ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400">
              {error}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="tc_code" className="text-xs font-medium">
                Tax Code *
              </Label>
              <Input
                id="tc_code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                autoFocus
                required
                placeholder="e.g. SR5"
                className="h-9 font-mono text-sm"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="tc_name" className="text-xs font-medium">
                Tax Name *
              </Label>
              <Input
                id="tc_name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="e.g. Standard Rate 5%"
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="tc_rate" className="text-xs font-medium">
                Rate (%) *
              </Label>
              <Input
                id="tc_rate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })}
                required
                placeholder="5"
                className="h-9 font-mono text-sm text-right"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tc_scope" className="text-xs font-medium">
                Tax Scope *
              </Label>
              <select
                id="tc_scope"
                value={form.tax_scope}
                onChange={(e) => setForm({ ...form, tax_scope: e.target.value as any })}
                className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm"
              >
                {TAX_SCOPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fta_code" className="text-xs font-medium">
                FTA Box Code
              </Label>
              <Input
                id="fta_code"
                value={form.fta_code}
                onChange={(e) => setForm({ ...form, fta_code: e.target.value })}
                placeholder="e.g. Box 1a"
                className="h-9 font-mono text-sm"
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              GL Tax Accounts
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="output_acc" className="text-xs font-medium">
                  Output VAT Account (Sales Tax)
                </Label>
                <select
                  id="output_acc"
                  value={form.output_account_id}
                  onChange={(e) => setForm({ ...form, output_account_id: e.target.value })}
                  className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm"
                >
                  <option value="">— Select Account —</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="input_acc" className="text-xs font-medium">
                  Input VAT Account (Purchase Tax)
                </Label>
                <select
                  id="input_acc"
                  value={form.input_account_id}
                  onChange={(e) => setForm({ ...form, input_account_id: e.target.value })}
                  className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm"
                >
                  <option value="">— Select Account —</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
              className="h-3.5 w-3.5 cursor-pointer accent-emerald-600"
            />
            Set as default tax code for standard sales/purchase transactions
          </label>
        </form>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/20 px-6 py-4">
          <div className="flex items-center gap-2">
            {mode === "edit" && taxCode ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={runToggleStatus}
                  disabled={isPending}
                  className="h-9 cursor-pointer text-xs"
                >
                  {taxCode.is_active ? "Deactivate" : "Reactivate"}
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
