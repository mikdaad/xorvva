"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createItem, updateItem, deleteItem, toggleItemStatus } from "@/lib/actions/items";
import { ITEM_TYPES, type ItemInput } from "@/lib/validations/masters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface AccountOption {
  id: string;
  name: string;
}

export interface TaxCodeOption {
  id: string;
  code: string;
  name: string;
  rate: number;
}

export interface ItemRow {
  id: string;
  entity_id: string;
  item_type: "inventory" | "service" | "expense" | "fixed_asset";
  code: string;
  name: string;
  name_ar: string | null;
  description: string | null;
  unit_of_measure: string | null;
  purchase_account_id: string | null;
  sales_account_id: string | null;
  tax_code_id: string | null;
  default_price: number | null;
  hsn_code: string | null;
  is_active: boolean;
}

interface ItemFormModalProps {
  entityId: string;
  mode: "create" | "edit";
  item: ItemRow | null;
  accounts: AccountOption[];
  taxCodes: TaxCodeOption[];
  onClose: () => void;
}

export function ItemFormModal({
  entityId,
  mode,
  item,
  accounts,
  taxCodes,
  onClose,
}: ItemFormModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const [form, setForm] = useState({
    item_type: item?.item_type ?? ("service" as const),
    code: item?.code ?? "",
    name: item?.name ?? "",
    name_ar: item?.name_ar ?? "",
    description: item?.description ?? "",
    unit_of_measure: item?.unit_of_measure ?? "Pcs",
    purchase_account_id: item?.purchase_account_id ?? "",
    sales_account_id: item?.sales_account_id ?? "",
    tax_code_id: item?.tax_code_id ?? "",
    default_price: item?.default_price ? String(item.default_price) : "",
    hsn_code: item?.hsn_code ?? "",
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

    const payload: ItemInput = {
      entity_id: entityId,
      item_type: form.item_type,
      code: form.code,
      name: form.name,
      name_ar: form.name_ar || undefined,
      description: form.description || undefined,
      unit_of_measure: form.unit_of_measure || undefined,
      purchase_account_id: form.purchase_account_id || null,
      sales_account_id: form.sales_account_id || null,
      tax_code_id: form.tax_code_id || null,
      default_price: form.default_price ? Number(form.default_price) : undefined,
      hsn_code: form.hsn_code || undefined,
    };

    startTransition(async () => {
      const res =
        mode === "edit" && item
          ? await updateItem(item.id, payload)
          : await createItem(payload);

      if (!res.success) {
        setError(res.error ?? "Could not save item.");
        return;
      }
      router.refresh();
      onClose();
    });
  }

  function runToggleStatus() {
    if (!item) return;
    startTransition(async () => {
      const res = await toggleItemStatus(item.id, !item.is_active);
      if (!res.success) {
        setError(res.error ?? "Could not update status.");
        return;
      }
      router.refresh();
      onClose();
    });
  }

  function runDelete() {
    if (!item) return;
    startTransition(async () => {
      const res = await deleteItem(item.id);
      if (!res.success) {
        setError(res.error ?? "Could not delete item.");
        setConfirmDelete(false);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <div className="my-auto flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold">
              {mode === "edit" ? "Edit Item" : "Create Item"}
            </h2>
            <p className="text-xs text-muted-foreground">
              Define inventory products, services, or expense items.
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

        <form ref={formRef} onSubmit={submit} className="flex-1 space-y-5 overflow-y-auto p-6">
          {error ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400">
              {error}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="item_code" className="text-xs font-medium">
                Item Code *
              </Label>
              <Input
                id="item_code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                autoFocus
                required
                placeholder="e.g. ITM-001"
                className="h-9 font-mono text-sm"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="item_name" className="text-xs font-medium">
                Item Name *
              </Label>
              <Input
                id="item_name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="e.g. Accounting Advisory Services"
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="item_type" className="text-xs font-medium">
                Item Type *
              </Label>
              <select
                id="item_type"
                value={form.item_type}
                onChange={(e) => setForm({ ...form, item_type: e.target.value as any })}
                className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm"
              >
                {ITEM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="uom" className="text-xs font-medium">
                Unit of Measure
              </Label>
              <Input
                id="uom"
                value={form.unit_of_measure}
                onChange={(e) => setForm({ ...form, unit_of_measure: e.target.value })}
                placeholder="Pcs, Hours, Units, Kg"
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="hsn_code" className="text-xs font-medium">
                HSN / SAC Code
              </Label>
              <Input
                id="hsn_code"
                value={form.hsn_code}
                onChange={(e) => setForm({ ...form, hsn_code: e.target.value })}
                placeholder="e.g. 998311"
                className="h-9 font-mono text-sm"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="default_price" className="text-xs font-medium">
                Default Selling Price (AED)
              </Label>
              <Input
                id="default_price"
                type="number"
                step="0.01"
                min="0"
                value={form.default_price}
                onChange={(e) => setForm({ ...form, default_price: e.target.value })}
                placeholder="0.00"
                className="h-9 font-mono text-sm text-right"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tax_code" className="text-xs font-medium">
                Tax Code
              </Label>
              <select
                id="tax_code"
                value={form.tax_code_id}
                onChange={(e) => setForm({ ...form, tax_code_id: e.target.value })}
                className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="">— Select Tax Code —</option>
                {taxCodes.map((tc) => (
                  <option key={tc.id} value={tc.id}>
                    {tc.code} ({tc.rate}%)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Accounting GL Mappings
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sales_account" className="text-xs font-medium">
                  Sales Account
                </Label>
                <select
                  id="sales_account"
                  value={form.sales_account_id}
                  onChange={(e) => setForm({ ...form, sales_account_id: e.target.value })}
                  className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm"
                >
                  <option value="">— Default Sales Account —</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="purchase_account" className="text-xs font-medium">
                  Purchase / Expense Account
                </Label>
                <select
                  id="purchase_account"
                  value={form.purchase_account_id}
                  onChange={(e) => setForm({ ...form, purchase_account_id: e.target.value })}
                  className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm"
                >
                  <option value="">— Default Purchase Account —</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="item_desc" className="text-xs font-medium">
              Description / Notes
            </Label>
            <Input
              id="item_desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Additional specifications or invoice line description"
              className="h-9 text-sm"
            />
          </div>
        </form>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/20 px-6 py-4">
          <div className="flex items-center gap-2">
            {mode === "edit" && item ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={runToggleStatus}
                  disabled={isPending}
                  className="h-9 cursor-pointer text-xs"
                >
                  {item.is_active ? "Deactivate" : "Reactivate"}
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
