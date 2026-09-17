"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CoaNode } from "@/lib/actions/accounts";
import {
  createAccount,
  updateAccount,
  deactivateAccount,
  reactivateAccount,
  deleteAccount,
} from "@/lib/actions/accounts";
import {
  ACCOUNT_TYPES,
  ACCOUNT_SUB_TYPES,
  PLACE_OF_SUPPLY,
  type AccountInput,
} from "@/lib/validations/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AccountType } from "@/types/database.types";

export interface GroupOption {
  id: string;
  name: string;
  account_type: string;
  account_sub_type: string | null;
  level: number;
}

export interface TaxCodeOption {
  id: string;
  code: string;
  name: string;
  rate: number;
}

interface AccountFormModalProps {
  entityId: string;
  mode: "create" | "edit";
  isGroup: boolean;
  parentId: string | null;
  account: CoaNode | null;
  groups: GroupOption[];
  taxCodes: TaxCodeOption[];
  onClose: () => void;
}

/**
 * Tally's "Create / Alter Ledger" screen.
 *
 * Keyboard model matches the rest of the app: Enter advances to the next field
 * rather than submitting, so an accountant can type straight down the form.
 * Ctrl+Enter (Tally's Ctrl+A) saves from anywhere.
 */
export function AccountFormModal({
  entityId,
  mode,
  isGroup,
  parentId,
  account,
  groups,
  taxCodes,
  onClose,
}: AccountFormModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const [form, setForm] = useState({
    name: account?.name ?? "",
    name_ar: account?.name_ar ?? "",
    code: account?.code ?? "",
    parent_id: account?.parent_id ?? parentId ?? "",
    account_type: account?.account_type ?? "asset",
    account_sub_type: account?.account_sub_type ?? "",
    is_bank: account?.is_bank ?? false,
    party_trn: account?.party_trn ?? "",
    place_of_supply: account?.place_of_supply ?? "",
    default_tax_code_id: account?.default_tax_code_id ?? "",
    opening_balance: account?.opening_balance ? String(account.opening_balance) : "0",
    opening_balance_type: account?.opening_balance_type ?? "Dr",
  });

  const groupsById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const selectedParent = form.parent_id ? groupsById.get(form.parent_id) : null;

  // A party ledger is one filed under Sundry Debtors/Creditors — that is where
  // a counter-party TRN and place of supply are meaningful for UAE invoices.
  const isPartyLedger = useMemo(() => {
    if (isGroup || !selectedParent) return false;
    const name = selectedParent.name.toLowerCase();
    return name === "sundry debtors" || name === "sundry creditors";
  }, [selectedParent, isGroup]);

  // Inherit the parent group's classification — Tally derives a ledger's nature
  // from the group it sits under, so the user should not have to restate it.
  useEffect(() => {
    if (!selectedParent) return;
    setForm((prev) => ({
      ...prev,
      account_type: selectedParent.account_type as typeof prev.account_type,
      account_sub_type: selectedParent.account_sub_type ?? prev.account_sub_type,
    }));
  }, [selectedParent]);

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

  // Enter advances to the next control instead of submitting.
  function onFormKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter" || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    if (target.tagName === "TEXTAREA" || target.tagName === "BUTTON") return;

    event.preventDefault();
    const focusable = Array.from(
      formRef.current?.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), select:not([disabled])'
      ) ?? []
    );
    const index = focusable.indexOf(target);
    if (index > -1 && index < focusable.length - 1) {
      focusable[index + 1].focus();
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const payload: AccountInput = {
      entity_id: entityId,
      name: form.name,
      name_ar: form.name_ar || "",
      code: form.code || "",
      parent_id: form.parent_id || null,
      is_group: isGroup,
      account_type: form.account_type as AccountInput["account_type"],
      account_sub_type: (form.account_sub_type || null) as AccountInput["account_sub_type"],
      is_bank: form.is_bank,
      default_tax_code_id: form.default_tax_code_id || null,
      place_of_supply: (form.place_of_supply || null) as AccountInput["place_of_supply"],
      party_trn: form.party_trn || "",
      opening_balance: Number(form.opening_balance || 0),
      opening_balance_type: form.opening_balance_type as "Dr" | "Cr",
      description: "",
    };

    startTransition(async () => {
      const res =
        mode === "edit" && account
          ? await updateAccount(account.id, payload)
          : await createAccount(payload);

      if (!res.success) {
        setError(res.error ?? "Could not save.");
        return;
      }
      router.refresh();
      onClose();
    });
  }

  function runDeactivate() {
    if (!account) return;
    startTransition(async () => {
      const res = account.is_active
        ? await deactivateAccount(account.id)
        : await reactivateAccount(account.id);
      if (!res.success) {
        setError(res.error ?? "Could not update status.");
        return;
      }
      router.refresh();
      onClose();
    });
  }

  function runDelete() {
    if (!account) return;
    startTransition(async () => {
      const res = await deleteAccount(account.id);
      if (!res.success) {
        setError(res.error ?? "Could not delete.");
        setConfirmDelete(false);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  const title =
    mode === "edit"
      ? `Alter ${isGroup ? "Group" : "Ledger"}`
      : `Create ${isGroup ? "Group" : "Ledger"}`;

  const subTypeOptions = ACCOUNT_SUB_TYPES.filter((s) => s.type === form.account_type);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <div className="my-auto flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            <p className="text-xs text-muted-foreground">
              {isGroup
                ? "Groups organise the chart; they cannot be posted to."
                : "Ledgers receive postings from vouchers."}
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

        <form
          ref={formRef}
          onSubmit={submit}
          onKeyDown={onFormKeyDown}
          className="flex-1 space-y-5 overflow-y-auto p-6"
        >
          {error ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400">
              {error}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="acc_name" className="text-xs font-medium">
                Name *
              </Label>
              <Input
                id="acc_name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
                required
                placeholder={isGroup ? "e.g. Marketing Expenses" : "e.g. Al Futtaim Trading LLC"}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="acc_name_ar" className="text-xs font-medium">
                Arabic Name
              </Label>
              <Input
                id="acc_name_ar"
                value={form.name_ar}
                onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
                dir="rtl"
                placeholder="الاسم بالعربية"
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="acc_parent" className="text-xs font-medium">
                Under *
              </Label>
              <select
                id="acc_parent"
                value={form.parent_id}
                onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
                className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="">— Primary (top level) —</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {" ".repeat(Math.max(0, (group.level - 1) * 2))}
                    {group.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="acc_code" className="text-xs font-medium">
                Code (optional)
              </Label>
              <Input
                id="acc_code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="e.g. 1120"
                className="h-9 font-mono text-sm"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="acc_type" className="text-xs font-medium">
                Account Type *
              </Label>
              <select
                id="acc_type"
                value={form.account_type}
                onChange={(e) =>
                  setForm({
                    ...form,
                    account_type: e.target.value as AccountType,
                    account_sub_type: "",
                  })
                }
                disabled={!!selectedParent}
                className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm disabled:opacity-60"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              {selectedParent ? (
                <p className="text-[10px] text-muted-foreground">
                  Inherited from “{selectedParent.name}”.
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="acc_sub_type" className="text-xs font-medium">
                Classification
              </Label>
              <select
                id="acc_sub_type"
                value={form.account_sub_type ?? ""}
                onChange={(e) => setForm({ ...form, account_sub_type: e.target.value })}
                className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="">— None —</option>
                {subTypeOptions.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!isGroup ? (
            <>
              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Tax Details
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="acc_tax_code" className="text-xs font-medium">
                      Applicable Tax Code
                    </Label>
                    <select
                      id="acc_tax_code"
                      value={form.default_tax_code_id}
                      onChange={(e) => setForm({ ...form, default_tax_code_id: e.target.value })}
                      className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm"
                    >
                      <option value="">— Not applicable —</option>
                      {taxCodes.map((tc) => (
                        <option key={tc.id} value={tc.id}>
                          {tc.code} — {tc.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="acc_pos" className="text-xs font-medium">
                      Place of Supply
                    </Label>
                    <select
                      id="acc_pos"
                      value={form.place_of_supply}
                      onChange={(e) => setForm({ ...form, place_of_supply: e.target.value })}
                      className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm"
                    >
                      <option value="">— None —</option>
                      {PLACE_OF_SUPPLY.map((emirate) => (
                        <option key={emirate} value={emirate}>
                          {emirate}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {isPartyLedger ? (
                  <div className="mt-4 space-y-1.5">
                    <Label htmlFor="acc_party_trn" className="text-xs font-medium">
                      Party TRN
                    </Label>
                    <Input
                      id="acc_party_trn"
                      value={form.party_trn}
                      onChange={(e) => setForm({ ...form, party_trn: e.target.value })}
                      maxLength={15}
                      placeholder="100XXXXXXXXXXXX"
                      className="h-9 font-mono text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Required on tax invoices when the counter-party is VAT registered.
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="acc_ob" className="text-xs font-medium">
                    Opening Balance
                  </Label>
                  <Input
                    id="acc_ob"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.opening_balance}
                    onChange={(e) => setForm({ ...form, opening_balance: e.target.value })}
                    className="h-9 text-right font-mono text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="acc_ob_type" className="text-xs font-medium">
                    Dr / Cr
                  </Label>
                  <select
                    id="acc_ob_type"
                    value={form.opening_balance_type ?? "Dr"}
                    onChange={(e) =>
                      setForm({ ...form, opening_balance_type: e.target.value as "Dr" | "Cr" })
                    }
                    className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm"
                  >
                    <option value="Dr">Dr</option>
                    <option value="Cr">Cr</option>
                  </select>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={form.is_bank}
                  onChange={(e) => setForm({ ...form, is_bank: e.target.checked })}
                  className="h-3.5 w-3.5 cursor-pointer accent-emerald-600"
                />
                This is a bank account (enables reconciliation)
              </label>
            </>
          ) : null}
        </form>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/20 px-6 py-4">
          <div className="flex items-center gap-2">
            {mode === "edit" && account && !account.is_system ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={runDeactivate}
                  disabled={isPending}
                  className="h-9 cursor-pointer text-xs"
                >
                  {account.is_active ? "Deactivate" : "Reactivate"}
                </Button>

                {account.has_transactions ? (
                  <span
                    className="text-[10px] text-muted-foreground"
                    title="Ledgers with posted transactions cannot be deleted."
                  >
                    Has postings — delete blocked
                  </span>
                ) : confirmDelete ? (
                  <Button
                    type="button"
                    onClick={runDelete}
                    disabled={isPending}
                    className="h-9 cursor-pointer bg-red-600 text-xs text-white hover:bg-red-700"
                  >
                    Confirm delete
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
            <span className="mr-1 hidden text-[10px] text-muted-foreground sm:inline">
              Ctrl+Enter to save
            </span>
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
