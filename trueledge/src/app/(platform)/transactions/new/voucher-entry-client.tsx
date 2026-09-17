"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  VOUCHER_TYPES,
  getVoucherConfig,
  getVoucherConfigByShortcut,
  type VoucherTypeConfig,
} from "@/lib/vouchers/voucher-types";
import type { VoucherType } from "@/types/database.types";
import { saveAndPostVoucher } from "@/lib/actions/voucher-entry";
import { SmartCombobox } from "@/components/ui/smart-combobox";
import {
  itemLedgerFor,
  type AccountOption,
  type ItemOption,
  type PartyOption,
  type TaxCodeOption,
} from "@/lib/vouchers/entry-options";
import { InlinePartyModal, type InlinePartyType } from "./inline-party-modal";
import { InlineItemModal } from "./inline-item-modal";

export type { AccountOption, ItemOption, PartyOption, TaxCodeOption };

export interface InitialDraft {
  id: string;
  voucherDate: string;
  partyId: string | null;
  reference: string;
  narration: string;
  lines: Array<{
    account_id: string;
    item_id: string | null;
    description: string;
    dr_cr: "dr" | "cr";
    amount: string;
    quantity: string;
    unit_price: string;
    discount_pct: string;
    tax_code_id: string;
  }>;
}


/** Which inline-create dialog is open, and what it was seeded with. */
type CreateTarget =
  | { kind: "party"; searchTerm: string }
  | { kind: "item"; searchTerm: string; rowKey: string }
  | null;

/** One row of the entry grid. Fields unused by the active mode stay untouched. */
interface GridRow {
  key: string;
  account_id: string;
  /** Invoice rows only; set when the line was picked from the item master. */
  item_id: string;
  description: string;
  /** Journal/contra modes: which side this row posts to. */
  dr_cr: "dr" | "cr";
  /** Journal/settlement: the plain amount. Invoice: computed from qty × rate. */
  amount: string;
  quantity: string;
  unit_price: string;
  discount_pct: string;
  tax_code_id: string;
}

let rowSeq = 0;
function blankRow(): GridRow {
  rowSeq += 1;
  return {
    key: `r${rowSeq}`,
    account_id: "",
    item_id: "",
    description: "",
    dr_cr: "dr",
    amount: "",
    quantity: "1",
    unit_price: "",
    discount_pct: "0",
    tax_code_id: "",
  };
}

function num(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function VoucherEntryClient({
  entityId,
  entityName,
  baseCurrency,
  sellerTrn,
  initialType,
  accounts,
  parties,
  taxCodes,
  items,
  initialDraft,
}: {
  entityId: string;
  entityName: string;
  baseCurrency: string;
  sellerTrn: string | null;
  initialType: VoucherType;
  accounts: AccountOption[];
  parties: PartyOption[];
  taxCodes: TaxCodeOption[];
  items: ItemOption[];
  initialDraft?: InitialDraft;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [voucherType, setVoucherType] = useState<VoucherType>(initialType);
  const [voucherDate, setVoucherDate] = useState(() => initialDraft?.voucherDate ?? new Date().toISOString().slice(0, 10));
  const [partyId, setPartyId] = useState(initialDraft?.partyId ?? "");
  const [reference, setReference] = useState(initialDraft?.reference ?? "");
  const [narration, setNarration] = useState(initialDraft?.narration ?? "");
  const [rows, setRows] = useState<GridRow[]>(() => {
    if (initialDraft?.lines?.length) {
      return initialDraft.lines.map((l, i) => ({
        key: `dr${i}`,
        account_id: l.account_id ?? "",
        item_id: l.item_id ?? "",
        description: l.description ?? "",
        dr_cr: l.dr_cr ?? "dr",
        amount: l.amount ?? "",
        quantity: l.quantity ?? "1",
        unit_price: l.unit_price ?? "",
        discount_pct: l.discount_pct ?? "0",
        tax_code_id: l.tax_code_id ?? "",
      }));
    }
    return [blankRow(), blankRow()];
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [createTarget, setCreateTarget] = useState<CreateTarget>(null);

  /**
   * Masters created inline during this session. They are merged with the server
   * lists so a new record is selectable immediately, before `router.refresh()`
   * brings the canonical rows back.
   */
  const [newParties, setNewParties] = useState<PartyOption[]>([]);
  const [newItems, setNewItems] = useState<ItemOption[]>([]);

  const allParties = useMemo(() => {
    const seen = new Set(parties.map((p) => p.id));
    return [...parties, ...newParties.filter((p) => !seen.has(p.id))];
  }, [parties, newParties]);

  const allItems = useMemo(() => {
    const seen = new Set(items.map((i) => i.id));
    return [...items, ...newItems.filter((i) => !seen.has(i.id))];
  }, [items, newItems]);

  const config = getVoucherConfig(voucherType) as VoucherTypeConfig;
  const isInvoice = config.mode === "invoice";
  const isSettlement = config.mode === "settlement";

  const formRef = useRef<HTMLFormElement>(null);

  /**
   * Tracks the control account the last auto-fill wrote, so switching party can
   * replace its own suggestion without ever discarding a manual choice.
   */
  const autoFilledAccountRef = useRef<string | null>(null);

  // A dialog owns the keyboard while it is open, so the voucher shortcuts are
  // simply not bound then.
  const isModalOpen = createTarget !== null;

  /**
   * Switching voucher type resets the grid: the columns and their meaning
   * change, so carrying rows across would leave amounts under headings they
   * were never entered for.
   */
  const switchVoucherType = useCallback((next: VoucherType) => {
    setVoucherType(next);
    setRows([blankRow(), blankRow()]);
    setPartyId("");
    setError(null);
    autoFilledAccountRef.current = null;
  }, []);

  // ---- F4–F9 voucher switching -------------------------------------------
  useEffect(() => {
    // Switching voucher type resets the grid, so it must not fire while an
    // inline-create dialog is open on top of a half-typed voucher.
    if (isModalOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (/^F[4-9]$/.test(event.key)) {
        const next = getVoucherConfigByShortcut(event.key);
        if (next) {
          event.preventDefault();
          switchVoucherType(next.type);
        }
        return;
      }

      // Ctrl+A is Tally's "Accept" (save) shortcut.
      if (event.key === "a" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        formRef.current?.requestSubmit();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isModalOpen, switchVoucherType]);

  // ---- Party → ledger auto-fill -------------------------------------------
  const selectedParty = useMemo(
    () => allParties.find((p) => p.id === partyId) ?? null,
    [allParties, partyId]
  );

  const partyLedger = useMemo(
    () =>
      selectedParty?.control_account_id
        ? accounts.find((a) => a.id === selectedParty.control_account_id) ?? null
        : null,
    [accounts, selectedParty]
  );

  /**
   * Selecting a party fills its default ledger into the grid — but only for
   * settlement and journal vouchers, where the party's control account is a
   * real line the accountant would otherwise pick by hand.
   *
   * Invoice vouchers deliberately opt out: the posting layer derives the
   * receivable/payable side from the party itself, so writing "Sundry Debtors"
   * into a grid row here would post it twice and unbalance the entry. The
   * ledger is surfaced read-only next to the party instead.
   */
  useEffect(() => {
    if (isInvoice) return;

    const target = selectedParty?.control_account_id ?? null;
    const previous = autoFilledAccountRef.current;

    if (target === previous) return;
    autoFilledAccountRef.current = target;

    if (!target) return;

    setRows((prev) => {
      // Already on the voucher — nothing to add.
      if (prev.some((row) => row.account_id === target)) return prev;

      // Prefer the row still holding the previous suggestion, otherwise the
      // first empty one. If every row is filled by hand, leave them all alone.
      const replaceIndex = previous ? prev.findIndex((r) => r.account_id === previous) : -1;
      const index = replaceIndex >= 0 ? replaceIndex : prev.findIndex((r) => !r.account_id);
      if (index < 0) return prev;

      const next = [...prev];
      next[index] = {
        ...next[index],
        account_id: target,
        // A receipt collects from a customer (credit the receivable); a payment
        // settles a supplier (debit the payable).
        dr_cr: config.direction === "inward" ? "cr" : "dr",
      };
      return next;
    });
  }, [selectedParty, isInvoice, config.direction]);

  // A fresh voucher must not inherit the previous one's auto-fill bookkeeping.
  useEffect(() => {
    autoFilledAccountRef.current = null;
  }, [voucherType]);

  // ---- Totals -------------------------------------------------------------
  const totals = useMemo(() => {
    if (isInvoice) {
      let subtotal = 0;
      let taxTotal = 0;

      for (const row of rows) {
        if (!row.account_id) continue;
        const gross = num(row.quantity) * num(row.unit_price);
        const net = gross * (1 - num(row.discount_pct) / 100);
        const rate = taxCodes.find((t) => t.id === row.tax_code_id)?.rate ?? 0;
        subtotal += net;
        taxTotal += net * (Number(rate) / 100);
      }

      return {
        subtotal: money(subtotal),
        taxTotal: money(taxTotal),
        grandTotal: money(subtotal + taxTotal),
        debit: 0,
        credit: 0,
        balanced: money(subtotal + taxTotal) > 0,
      };
    }

    let debit = 0;
    let credit = 0;

    for (const row of rows) {
      if (!row.account_id) continue;
      const amount = num(row.amount);
      if (amount === 0) continue;
      if (row.dr_cr === "dr") debit += amount;
      else credit += amount;
    }

    return {
      subtotal: 0,
      taxTotal: 0,
      grandTotal: money(debit),
      debit: money(debit),
      credit: money(credit),
      balanced: money(debit) === money(credit) && money(debit) > 0,
    };
  }, [rows, isInvoice, taxCodes]);

  const updateRow = useCallback((key: string, patch: Partial<GridRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }, []);

  const addRow = useCallback(() => setRows((prev) => [...prev, blankRow()]), []);

  const removeRow = useCallback((key: string) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  }, []);

  /**
   * Picking an item fills the rest of its row: ledger, tax code and rate all
   * come from the item master, which is the keystroke saving this feature is
   * for. Existing values are preserved — re-picking an item never wipes a rate
   * the accountant already typed.
   */
  const applyItemToRow = useCallback(
    (rowKey: string, item: ItemOption) => {
      const ledger = itemLedgerFor(item, config.direction);

      setRows((prev) =>
        prev.map((row) => {
          if (row.key !== rowKey) return row;

          const emptyPrice = row.unit_price === "" || num(row.unit_price) === 0;

          return {
            ...row,
            item_id: item.id,
            account_id: ledger ?? row.account_id,
            description: row.description || item.name,
            tax_code_id: row.tax_code_id || item.tax_code_id || "",
            unit_price:
              emptyPrice && item.default_price != null
                ? String(item.default_price)
                : row.unit_price,
          };
        })
      );
    },
    [config.direction]
  );

  /** Selects a freshly created party and lets the auto-fill effect follow. */
  const handlePartyCreated = useCallback(
    (party: PartyOption) => {
      setNewParties((prev) => [...prev, party]);
      setPartyId(party.id);
      setCreateTarget(null);
      setNotice(`Created party ${party.name}.`);
      // Pull the canonical master list in the background; the merged local copy
      // keeps the selection valid until it lands.
      router.refresh();
    },
    [router]
  );

  const handleItemCreated = useCallback(
    (item: ItemOption, rowKey: string) => {
      setNewItems((prev) => [...prev, item]);
      applyItemToRow(rowKey, item);
      setCreateTarget(null);
      setNotice(`Created item ${item.name}.`);
      router.refresh();
    },
    [applyItemToRow, router]
  );

  /** Enter advances to the next field instead of submitting, as Tally does. */
  const handleGridKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key !== "Enter" || event.shiftKey) return;

      const target = event.target as HTMLElement;
      if (target.tagName === "TEXTAREA") return;

      event.preventDefault();

      const focusables = Array.from(
        formRef.current?.querySelectorAll<HTMLElement>(
          'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])'
        ) ?? []
      ).filter((el) => el.offsetParent !== null);

      const index = focusables.indexOf(target);

      if (index >= 0 && index < focusables.length - 1) {
        focusables[index + 1].focus();
        return;
      }

      // Enter on the last field appends a row and moves into it.
      if (index === focusables.length - 1) {
        addRow();
      }
    },
    [addRow]
  );

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const activeRows = rows.filter((r) => r.account_id);

    if (activeRows.length === 0) {
      setError("Add at least one ledger line.");
      return;
    }

    if (!isInvoice && !totals.balanced) {
      setError(
        `Entry is not balanced — debits ${totals.debit.toFixed(2)} vs credits ${totals.credit.toFixed(2)}.`
      );
      return;
    }

    if (isInvoice && totals.grandTotal <= 0) {
      setError("Invoice total must be greater than zero.");
      return;
    }

    if (config.requiresParty && !partyId) {
      setError(`Select a ${config.direction === "outward" ? "customer" : "supplier"}.`);
      return;
    }

    startTransition(async () => {
      const result = await saveAndPostVoucher({
        voucher_id: initialDraft?.id,
        entity_id: entityId,
        voucher_type: voucherType,
        voucher_date: voucherDate,
        party_id: partyId || null,
        reference: reference || null,
        narration: narration || null,
        seller_trn: sellerTrn,
        lines: activeRows.map((row) => ({
          account_id: row.account_id,
          item_id: isInvoice && row.item_id ? row.item_id : null,
          description: row.description || null,
          dr_cr: row.dr_cr,
          amount: num(row.amount),
          quantity: isInvoice ? num(row.quantity) : 1,
          unit_price: isInvoice ? num(row.unit_price) : num(row.amount),
          discount_pct: isInvoice ? num(row.discount_pct) : 0,
          tax_code_id: isInvoice && row.tax_code_id ? row.tax_code_id : null,
        })),
      });

      if (!result.success) {
        setError(result.error ?? "Could not post the voucher.");
        return;
      }

      setNotice(`Posted ${result.voucherNumber}.`);
      setRows([blankRow(), blankRow()]);
      setPartyId("");
      setReference("");
      setNarration("");
      router.refresh();
    });
  }

  const partyOptions = useMemo(() => {
    if (!config.requiresParty && !isSettlement) return allParties;
    const wanted = config.direction === "outward" ? "customer" : "supplier";
    const filtered = allParties.filter((p) => p.party_type === wanted || p.party_type === "both");
    return filtered.length > 0 ? filtered : allParties;
  }, [allParties, config, isSettlement]);

  /** New parties default to the kind this voucher is asking for. */
  const inlinePartyType: InlinePartyType =
    config.direction === "inward" ? "supplier" : "customer";

  const partyLabel = config.direction === "outward" ? "Customer" : "Supplier";

  return (
    <div className="flex flex-col gap-4 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Voucher Entry</h1>
          <p className="text-sm text-muted-foreground">
            {entityName} · amounts in {baseCurrency}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          <kbd className="rounded border px-1">F4</kbd>–<kbd className="rounded border px-1">F9</kbd>{" "}
          switch voucher · <kbd className="rounded border px-1">Enter</kbd> next field ·{" "}
          <kbd className="rounded border px-1">Alt+C</kbd> create master ·{" "}
          <kbd className="rounded border px-1">Ctrl+A</kbd> save
        </p>
      </header>

      {/* Voucher type tabs */}
      <div
        role="tablist"
        aria-label="Voucher type"
        className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1"
      >
        {VOUCHER_TYPES.map((v) => {
          const active = v.type === voucherType;
          return (
            <button
              key={v.type}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => switchVoucherType(v.type)}
              className={`flex-1 rounded-md px-3 py-2 text-left text-sm transition ${
                active
                  ? "bg-background shadow-sm ring-1 ring-border"
                  : "hover:bg-background/60"
              }`}
            >
              <span className="flex items-center gap-2">
                <span
                  className={`rounded px-1 text-[10px] font-bold ${
                    active ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20"
                  }`}
                >
                  {v.shortcut}
                </span>
                <span className="font-medium">{v.label}</span>
              </span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">{v.hint}</span>
            </button>
          );
        })}
      </div>

      <form ref={formRef} onSubmit={handleSubmit} onKeyDown={handleGridKeyDown}>
        {/* Voucher header */}
        <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Date</span>
            <input
              type="date"
              value={voucherDate}
              onChange={(e) => setVoucherDate(e.target.value)}
              required
              className="h-9 rounded-md border bg-background px-2 text-sm"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">
              {partyLabel}
              {config.requiresParty && <span className="text-destructive"> *</span>}
            </span>
            <SmartCombobox<PartyOption>
              id="voucher-party"
              aria-label={partyLabel}
              items={partyOptions}
              value={partyId}
              onChange={(id) => {
                setPartyId(id);
                setNotice(null);
              }}
              getLabel={(party) => party.name}
              getHint={(party) => party.trn}
              placeholder={config.requiresParty ? "Search party…" : "None"}
              emptyMessage="No matching party"
              onCreateNew={(term) => setCreateTarget({ kind: "party", searchTerm: term })}
              createLabel="Create party"
            />
            {/* On invoices the party's control ledger is derived server-side, so
                it is shown rather than written into a grid line. */}
            {isInvoice && partyLedger && (
              <span className="text-[11px] text-muted-foreground">
                Posts to {partyLedger.name}
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Reference</span>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Cheque / PO no."
              className="h-9 rounded-md border bg-background px-2 text-sm"
            />
          </label>

          <div className="flex flex-col justify-end text-sm">
            <span className="text-xs text-muted-foreground">Voucher</span>
            <span className="font-medium">{config.label}</span>
          </div>
        </div>

        {/* Entry grid */}
        <div className="mt-4 overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="w-8 px-2 py-2 text-left">#</th>
                {isInvoice && <th className="min-w-[200px] px-2 py-2 text-left">Item</th>}
                <th className="min-w-[220px] px-2 py-2 text-left">Ledger</th>
                <th className="min-w-[160px] px-2 py-2 text-left">Narration</th>
                {isInvoice ? (
                  <>
                    <th className="w-16 px-2 py-2 text-left">UoM</th>
                    <th className="w-20 px-2 py-2 text-right">Qty</th>
                    <th className="w-24 px-2 py-2 text-right">Rate</th>
                    <th className="w-20 px-2 py-2 text-right">Disc %</th>
                    <th className="w-32 px-2 py-2 text-left">Tax</th>
                    <th className="w-28 px-2 py-2 text-right">Amount</th>
                  </>
                ) : (
                  <>
                    <th className="w-20 px-2 py-2 text-center">Dr/Cr</th>
                    <th className="w-32 px-2 py-2 text-right">Amount</th>
                  </>
                )}
                <th className="w-8 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const gross = num(row.quantity) * num(row.unit_price);
                const net = gross * (1 - num(row.discount_pct) / 100);
                const rate = taxCodes.find((t) => t.id === row.tax_code_id)?.rate ?? 0;
                const lineTotal = net + net * (Number(rate) / 100);
                const rowItem = row.item_id
                  ? allItems.find((i) => i.id === row.item_id) ?? null
                  : null;

                return (
                  <tr key={row.key} className="border-t">
                    <td className="px-2 py-1 text-xs text-muted-foreground">{idx + 1}</td>

                    {isInvoice && (
                      <td className="px-2 py-1">
                        <SmartCombobox<ItemOption>
                          aria-label={`Item for line ${idx + 1}`}
                          items={allItems}
                          value={row.item_id}
                          onChange={(id) => {
                            const item = allItems.find((i) => i.id === id);
                            if (item) applyItemToRow(row.key, item);
                          }}
                          getLabel={(item) => item.name}
                          getHint={(item) => item.code}
                          placeholder="Search item…"
                          emptyMessage="No matching item"
                          onCreateNew={(term) =>
                            setCreateTarget({ kind: "item", searchTerm: term, rowKey: row.key })
                          }
                          createLabel="Create item"
                        />
                      </td>
                    )}

                    <td className="px-2 py-1">
                      <SmartCombobox<AccountOption>
                        aria-label={`Ledger for line ${idx + 1}`}
                        items={accounts}
                        value={row.account_id}
                        onChange={(id) => updateRow(row.key, { account_id: id })}
                        getLabel={(account) => account.name}
                        getHint={(account) => account.code}
                        placeholder="Type to search ledger…"
                        emptyMessage="No matching ledger"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        value={row.description}
                        onChange={(e) => updateRow(row.key, { description: e.target.value })}
                        aria-label={`Narration for line ${idx + 1}`}
                        className="h-8 w-full rounded border bg-background px-2 text-sm"
                      />
                    </td>

                    {isInvoice ? (
                      <>
                        <td className="px-2 py-1 text-xs text-muted-foreground">
                          {rowItem?.unit_of_measure ?? "—"}
                        </td>
                        <td className="px-2 py-1">
                          <input
                            inputMode="decimal"
                            value={row.quantity}
                            onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                            className="h-8 w-full rounded border bg-background px-2 text-right text-sm"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            inputMode="decimal"
                            value={row.unit_price}
                            onChange={(e) => updateRow(row.key, { unit_price: e.target.value })}
                            className="h-8 w-full rounded border bg-background px-2 text-right text-sm"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            inputMode="decimal"
                            value={row.discount_pct}
                            onChange={(e) => updateRow(row.key, { discount_pct: e.target.value })}
                            className="h-8 w-full rounded border bg-background px-2 text-right text-sm"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <select
                            value={row.tax_code_id}
                            onChange={(e) => updateRow(row.key, { tax_code_id: e.target.value })}
                            className="h-8 w-full rounded border bg-background px-1 text-sm"
                          >
                            <option value="">None</option>
                            {taxCodes.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.code} ({Number(t.rate)}%)
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1 text-right font-mono text-sm tabular-nums">
                          {lineTotal > 0 ? lineTotal.toFixed(2) : "—"}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-2 py-1">
                          <select
                            value={row.dr_cr}
                            onChange={(e) =>
                              updateRow(row.key, { dr_cr: e.target.value as "dr" | "cr" })
                            }
                            className="h-8 w-full rounded border bg-background px-1 text-center text-sm font-medium"
                          >
                            <option value="dr">Dr</option>
                            <option value="cr">Cr</option>
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          <input
                            inputMode="decimal"
                            value={row.amount}
                            onChange={(e) => updateRow(row.key, { amount: e.target.value })}
                            className="h-8 w-full rounded border bg-background px-2 text-right font-mono text-sm tabular-nums"
                          />
                        </td>
                      </>
                    )}

                    <td className="px-2 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(row.key)}
                        aria-label={`Remove line ${idx + 1}`}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          onClick={addRow}
          className="mt-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          + Add line
        </button>

        {/* Narration + totals */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Narration</span>
            <textarea
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              rows={3}
              placeholder="Being…"
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
            />
          </label>

          <div className="rounded-lg border p-4 text-sm">
            {isInvoice ? (
              <dl className="space-y-1">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="font-mono tabular-nums">{totals.subtotal.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">VAT</dt>
                  <dd className="font-mono tabular-nums">{totals.taxTotal.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between border-t pt-1 text-base font-semibold">
                  <dt>Total ({baseCurrency})</dt>
                  <dd className="font-mono tabular-nums">{totals.grandTotal.toFixed(2)}</dd>
                </div>
              </dl>
            ) : (
              <dl className="space-y-1">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Total Debit</dt>
                  <dd className="font-mono tabular-nums">{totals.debit.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Total Credit</dt>
                  <dd className="font-mono tabular-nums">{totals.credit.toFixed(2)}</dd>
                </div>
                <div
                  className={`flex justify-between border-t pt-1 font-medium ${
                    totals.balanced ? "text-emerald-600" : "text-destructive"
                  }`}
                >
                  <dt>{totals.balanced ? "Balanced" : "Difference"}</dt>
                  <dd className="font-mono tabular-nums">
                    {totals.balanced ? "✓" : Math.abs(totals.debit - totals.credit).toFixed(2)}
                  </dd>
                </div>
              </dl>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-3 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
            {notice}
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="submit"
            disabled={isPending || (!isInvoice && !totals.balanced)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isPending ? "Posting…" : "Save & Post"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
          >
            Cancel
          </button>
          {!isInvoice && !totals.balanced && (
            <span className="text-xs text-muted-foreground">
              Debits must equal credits before posting.
            </span>
          )}
        </div>
      </form>

      {/* Inline master creation. Mounted outside the form so the dialog's own
          submit button never submits the voucher. */}
      {createTarget?.kind === "party" && (
        <InlinePartyModal
          entityId={entityId}
          initialName={createTarget.searchTerm}
          initialPartyType={inlinePartyType}
          accounts={accounts}
          onCreated={handlePartyCreated}
          onClose={() => setCreateTarget(null)}
        />
      )}

      {createTarget?.kind === "item" && (
        <InlineItemModal
          entityId={entityId}
          initialName={createTarget.searchTerm}
          direction={config.direction === "inward" ? "inward" : "outward"}
          accounts={accounts}
          taxCodes={taxCodes}
          onCreated={(item) => handleItemCreated(item, createTarget.rowKey)}
          onClose={() => setCreateTarget(null)}
        />
      )}
    </div>
  );
}
