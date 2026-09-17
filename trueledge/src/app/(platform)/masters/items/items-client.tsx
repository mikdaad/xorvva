"use client";

import { useMemo, useState } from "react";
import { ItemFormModal, type ItemRow, type AccountOption, type TaxCodeOption } from "./item-form-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface ItemsClientProps {
  entityId: string;
  items: ItemRow[];
  accounts: AccountOption[];
  taxCodes: TaxCodeOption[];
}

export function ItemsClient({ entityId, items, accounts, taxCodes }: ItemsClientProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [modalState, setModalState] = useState<{
    open: boolean;
    mode: "create" | "edit";
    item: ItemRow | null;
  }>({ open: false, mode: "create", item: null });

  const query = search.trim().toLowerCase();

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (!showInactive && !item.is_active) return false;
      if (typeFilter !== "all" && item.item_type !== typeFilter) return false;

      if (!query) return true;
      return (
        item.name.toLowerCase().includes(query) ||
        (item.name_ar ?? "").toLowerCase().includes(query) ||
        item.code.toLowerCase().includes(query) ||
        (item.hsn_code ?? "").toLowerCase().includes(query)
      );
    });
  }, [items, query, typeFilter, showInactive]);

  function openCreate() {
    setModalState({ open: true, mode: "create", item: null });
  }

  function openEdit(item: ItemRow) {
    setModalState({ open: true, mode: "edit", item });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code, name, or HSN code…"
            className="h-9 w-full max-w-xs text-sm"
          />

          <div className="flex items-center rounded-lg border border-border bg-muted/20 p-1">
            {["all", "inventory", "service", "expense", "fixed_asset"].map((type) => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`capitalize rounded px-3 py-1 text-xs font-medium transition-colors ${
                  typeFilter === type ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {type.replace(/_/g, " ")}
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

        <Button
          onClick={openCreate}
          className="h-9 cursor-pointer bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          + Add Item
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-10 bg-muted/40 backdrop-blur">
            <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="px-6 py-2.5">Code</th>
              <th className="px-3 py-2.5">Item Name</th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5">UOM</th>
              <th className="px-3 py-2.5">HSN Code</th>
              <th className="px-3 py-2.5 text-right">Default Price</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-6 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filteredItems.map((item) => (
              <tr
                key={item.id}
                className={`group transition-colors hover:bg-muted/30 ${
                  item.is_active ? "" : "opacity-50"
                }`}
              >
                <td className="px-6 py-3 font-mono text-xs font-semibold text-foreground">
                  {item.code}
                </td>
                <td className="px-3 py-3">
                  <div className="font-medium text-sm text-foreground">{item.name}</div>
                  {item.description ? (
                    <div className="text-xs text-muted-foreground line-clamp-1">
                      {item.description}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  <Badge variant="outline" className="capitalize text-[11px]">
                    {item.item_type.replace(/_/g, " ")}
                  </Badge>
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">
                  {item.unit_of_measure ?? "—"}
                </td>
                <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                  {item.hsn_code ?? "—"}
                </td>
                <td className="px-3 py-3 text-right font-mono text-xs">
                  {item.default_price ? `AED ${item.default_price.toFixed(2)}` : "—"}
                </td>
                <td className="px-3 py-3 text-xs">
                  {item.is_active ? (
                    <span className="text-[10px] font-medium text-emerald-400">Active</span>
                  ) : (
                    <span className="text-[10px] font-medium text-muted-foreground">Inactive</span>
                  )}
                </td>
                <td className="px-6 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => openEdit(item)}
                    className="cursor-pointer rounded px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredItems.length === 0 ? (
          <div className="p-16 text-center">
            <h3 className="text-sm font-bold">No items found</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Try a different filter or click &quot;+ Add Item&quot; to create your first inventory or service item.
            </p>
          </div>
        ) : null}
      </div>

      {modalState.open ? (
        <ItemFormModal
          entityId={entityId}
          mode={modalState.mode}
          item={modalState.item}
          accounts={accounts}
          taxCodes={taxCodes}
          onClose={() => setModalState({ open: false, mode: "create", item: null })}
        />
      ) : null}
    </div>
  );
}
