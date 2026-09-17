"use client";

import { useRef, useState, useTransition } from "react";
import { createItemInline } from "@/lib/actions/items";
import { Label } from "@/components/ui/label";
import { SmartCombobox } from "@/components/ui/smart-combobox";
import { ITEM_TYPES, UOM_OPTIONS } from "@/lib/validations/masters";
import type { AccountOption, ItemOption, TaxCodeOption } from "@/lib/vouchers/entry-options";
import { InlineModalFooter, InlineModalShell } from "./inline-modal-shell";

type ItemType = (typeof ITEM_TYPES)[number]["value"];

/** A service is normally counted in hours; everything else in units. */
function defaultUomFor(itemType: ItemType): string {
  return itemType === "service" ? "Hours" : "Nos";
}

export function InlineItemModal({
  entityId,
  initialName,
  /** Which ledger the current voucher will actually read back. */
  direction,
  accounts,
  taxCodes,
  onCreated,
  onClose,
}: {
  entityId: string;
  initialName: string;
  direction: "outward" | "inward";
  accounts: AccountOption[];
  taxCodes: TaxCodeOption[];
  onCreated: (item: ItemOption) => void;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [name, setName] = useState(initialName);
  const [itemType, setItemType] = useState<ItemType>("inventory");
  const [uom, setUom] = useState("Nos");
  const [salesAccountId, setSalesAccountId] = useState("");
  const [purchaseAccountId, setPurchaseAccountId] = useState("");
  const [taxCodeId, setTaxCodeId] = useState(() => taxCodes[0]?.id ?? "");
  const [defaultPrice, setDefaultPrice] = useState("");

  const isOutward = direction === "outward";

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createItemInline({
        entity_id: entityId,
        name,
        item_type: itemType,
        unit_of_measure: uom,
        sales_account_id: salesAccountId || null,
        purchase_account_id: purchaseAccountId || null,
        tax_code_id: taxCodeId || null,
        default_price: defaultPrice ? Number(defaultPrice) : undefined,
      });

      if (!result.success || !result.item) {
        setError(result.error ?? "Could not create the item.");
        return;
      }

      onCreated(result.item);
    });
  }

  return (
    <InlineModalShell
      title="Create Item"
      description="Maps the item to its ledgers and tax so the line fills itself in."
      labelledBy="inline-item-title"
      onClose={onClose}
      onSubmitShortcut={() => formRef.current?.requestSubmit()}
    >
      <form ref={formRef} onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {error}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="inline-item-name" className="text-xs">
              Item Name <span className="text-destructive">*</span>
            </Label>
            <input
              id="inline-item-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              autoComplete="off"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <p className="text-[11px] text-muted-foreground">
              An item code is generated from the name; edit it later in Masters.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inline-item-type" className="text-xs">
                Item Type <span className="text-destructive">*</span>
              </Label>
              <select
                id="inline-item-type"
                value={itemType}
                onChange={(event) => {
                  const next = event.target.value as ItemType;
                  setItemType(next);
                  setUom((current) =>
                    current === defaultUomFor(itemType) ? defaultUomFor(next) : current
                  );
                }}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {ITEM_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inline-item-uom" className="text-xs">
                Unit of Measure <span className="text-destructive">*</span>
              </Label>
              <select
                id="inline-item-uom"
                value={uom}
                onChange={(event) => setUom(event.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {UOM_OPTIONS.map((unit) => (
                  <option key={unit.value} value={unit.value}>
                    {unit.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/*
            Two mappings, not one: the same item posts to income on a sales
            invoice and to expense on a purchase bill. The one this voucher will
            read is marked and comes first.
          */}
          <fieldset className="space-y-3 rounded-lg border border-border p-3">
            <legend className="px-1 text-xs font-medium">Ledger mapping</legend>

            <div className="space-y-1.5">
              <Label htmlFor="inline-item-sales" className="text-xs">
                Income ledger (sales)
                {isOutward && (
                  <span className="ml-1 rounded bg-primary/10 px-1 text-[10px] font-medium text-primary">
                    used here
                  </span>
                )}
              </Label>
              <SmartCombobox
                id="inline-item-sales"
                aria-label="Income ledger"
                items={accounts}
                value={salesAccountId}
                onChange={setSalesAccountId}
                getLabel={(account) => account.name}
                getHint={(account) => account.code}
                placeholder="Sales / Revenue…"
                emptyMessage="No matching ledger"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inline-item-purchase" className="text-xs">
                Expense ledger (purchase)
                {!isOutward && (
                  <span className="ml-1 rounded bg-primary/10 px-1 text-[10px] font-medium text-primary">
                    used here
                  </span>
                )}
              </Label>
              <SmartCombobox
                id="inline-item-purchase"
                aria-label="Expense ledger"
                items={accounts}
                value={purchaseAccountId}
                onChange={setPurchaseAccountId}
                getLabel={(account) => account.name}
                getHint={(account) => account.code}
                placeholder="Purchases / Cost of sales…"
                emptyMessage="No matching ledger"
              />
            </div>

            <p className="text-[11px] text-muted-foreground">
              Map at least one. This {isOutward ? "sales" : "purchase"} voucher reads the{" "}
              {isOutward ? "income" : "expense"} ledger.
            </p>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inline-item-tax" className="text-xs">
                Default Tax Code
              </Label>
              <select
                id="inline-item-tax"
                value={taxCodeId}
                onChange={(event) => setTaxCodeId(event.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="">None</option>
                {taxCodes.map((code) => (
                  <option key={code.id} value={code.id}>
                    {code.code} ({Number(code.rate)}%)
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inline-item-price" className="text-xs">
                Default Rate <span className="text-muted-foreground">(optional)</span>
              </Label>
              <input
                id="inline-item-price"
                value={defaultPrice}
                onChange={(event) => setDefaultPrice(event.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="h-9 w-full rounded-md border bg-background px-2 text-right font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
          </div>
        </div>

        <InlineModalFooter isPending={isPending} submitLabel="Create Item" onClose={onClose} />
      </form>
    </InlineModalShell>
  );
}
