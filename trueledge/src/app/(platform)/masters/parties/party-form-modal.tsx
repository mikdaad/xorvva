"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createParty, updateParty, deleteParty, togglePartyStatus } from "@/lib/actions/parties";
import { PARTY_TYPES, TAX_TREATMENTS, type PartyInput } from "@/lib/validations/masters";
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

export interface PartyRow {
  id: string;
  entity_id: string;
  party_type: "customer" | "supplier" | "both" | "employee";
  code: string | null;
  name: string;
  name_ar: string | null;
  trn: string | null;
  tax_treatment: "registered" | "unregistered" | "designated_zone" | "exempt" | "reverse_charge";
  control_account_id: string | null;
  default_tax_code_id: string | null;
  credit_limit: number | null;
  payment_terms_days: number | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  country: string | null;
  is_active: boolean;
}

interface PartyFormModalProps {
  entityId: string;
  mode: "create" | "edit";
  party: PartyRow | null;
  accounts: AccountOption[];
  taxCodes: TaxCodeOption[];
  onClose: () => void;
}

export function PartyFormModal({
  entityId,
  mode,
  party,
  accounts,
  taxCodes,
  onClose,
}: PartyFormModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const [form, setForm] = useState({
    party_type: party?.party_type ?? ("customer" as const),
    code: party?.code ?? "",
    name: party?.name ?? "",
    name_ar: party?.name_ar ?? "",
    trn: party?.trn ?? "",
    tax_treatment: party?.tax_treatment ?? ("registered" as const),
    control_account_id: party?.control_account_id ?? "",
    default_tax_code_id: party?.default_tax_code_id ?? "",
    credit_limit: party?.credit_limit ? String(party.credit_limit) : "",
    payment_terms_days: party?.payment_terms_days ? String(party.payment_terms_days) : "",
    contact_person: party?.contact_person ?? "",
    email: party?.email ?? "",
    phone: party?.phone ?? "",
    address_line1: party?.address_line1 ?? "",
    address_line2: party?.address_line2 ?? "",
    city: party?.city ?? "",
    country: party?.country ?? "AE",
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

    const payload: PartyInput = {
      entity_id: entityId,
      party_type: form.party_type,
      code: form.code || undefined,
      name: form.name,
      name_ar: form.name_ar || undefined,
      trn: form.trn || undefined,
      tax_treatment: form.tax_treatment,
      control_account_id: form.control_account_id || null,
      default_tax_code_id: form.default_tax_code_id || null,
      credit_limit: form.credit_limit ? Number(form.credit_limit) : undefined,
      payment_terms_days: form.payment_terms_days ? Number(form.payment_terms_days) : undefined,
      contact_person: form.contact_person || undefined,
      email: form.email || undefined,
      phone: form.phone || undefined,
      address_line1: form.address_line1 || undefined,
      address_line2: form.address_line2 || undefined,
      city: form.city || undefined,
      country: form.country || "AE",
    };

    startTransition(async () => {
      const res =
        mode === "edit" && party
          ? await updateParty(party.id, payload)
          : await createParty(payload);

      if (!res.success) {
        setError(res.error ?? "Could not save party.");
        return;
      }
      router.refresh();
      onClose();
    });
  }

  function runToggleStatus() {
    if (!party) return;
    startTransition(async () => {
      const res = await togglePartyStatus(party.id, !party.is_active);
      if (!res.success) {
        setError(res.error ?? "Could not update status.");
        return;
      }
      router.refresh();
      onClose();
    });
  }

  function runDelete() {
    if (!party) return;
    startTransition(async () => {
      const res = await deleteParty(party.id);
      if (!res.success) {
        setError(res.error ?? "Could not delete party.");
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
              {mode === "edit" ? "Edit Party" : "Create Party"}
            </h2>
            <p className="text-xs text-muted-foreground">
              Manage customer, supplier, and party master records.
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="party_name" className="text-xs font-medium">
                Party Name *
              </Label>
              <Input
                id="party_name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
                required
                placeholder="e.g. Al Futtaim Trading LLC"
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="party_name_ar" className="text-xs font-medium">
                Arabic Name
              </Label>
              <Input
                id="party_name_ar"
                value={form.name_ar}
                onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
                dir="rtl"
                placeholder="الاسم بالعربية"
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="party_type" className="text-xs font-medium">
                Party Type *
              </Label>
              <select
                id="party_type"
                value={form.party_type}
                onChange={(e) => setForm({ ...form, party_type: e.target.value as any })}
                className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm"
              >
                {PARTY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="party_code" className="text-xs font-medium">
                Code / Account No.
              </Label>
              <Input
                id="party_code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="e.g. CUST-001"
                className="h-9 font-mono text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="party_trn" className="text-xs font-medium">
                TRN (15 digits)
              </Label>
              <Input
                id="party_trn"
                value={form.trn}
                onChange={(e) => setForm({ ...form, trn: e.target.value })}
                maxLength={15}
                placeholder="100XXXXXXXXXXXX"
                className="h-9 font-mono text-sm"
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Tax & Accounting
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="tax_treatment" className="text-xs font-medium">
                  Tax Treatment *
                </Label>
                <select
                  id="tax_treatment"
                  value={form.tax_treatment}
                  onChange={(e) => setForm({ ...form, tax_treatment: e.target.value as any })}
                  className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm"
                >
                  {TAX_TREATMENTS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="control_account" className="text-xs font-medium">
                  Control Account
                </Label>
                <select
                  id="control_account"
                  value={form.control_account_id}
                  onChange={(e) => setForm({ ...form, control_account_id: e.target.value })}
                  className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm"
                >
                  <option value="">— Default Control Account —</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="default_tax_code" className="text-xs font-medium">
                  Default Tax Code
                </Label>
                <select
                  id="default_tax_code"
                  value={form.default_tax_code_id}
                  onChange={(e) => setForm({ ...form, default_tax_code_id: e.target.value })}
                  className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm"
                >
                  <option value="">— None —</option>
                  {taxCodes.map((tc) => (
                    <option key={tc.id} value={tc.id}>
                      {tc.code} ({tc.rate}%)
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="credit_limit" className="text-xs font-medium">
                Credit Limit (AED)
              </Label>
              <Input
                id="credit_limit"
                type="number"
                min="0"
                value={form.credit_limit}
                onChange={(e) => setForm({ ...form, credit_limit: e.target.value })}
                placeholder="0.00"
                className="h-9 font-mono text-sm text-right"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="payment_terms" className="text-xs font-medium">
                Payment Terms (Days)
              </Label>
              <Input
                id="payment_terms"
                type="number"
                min="0"
                value={form.payment_terms_days}
                onChange={(e) => setForm({ ...form, payment_terms_days: e.target.value })}
                placeholder="e.g. 30"
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Contact & Address
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="contact_person" className="text-xs font-medium">
                  Contact Person
                </Label>
                <Input
                  id="contact_person"
                  value={form.contact_person}
                  onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
                  placeholder="Full Name"
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="accounts@company.com"
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs font-medium">
                  Phone
                </Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+971 4 123 4567"
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="address1" className="text-xs font-medium">
                  Address Line
                </Label>
                <Input
                  id="address1"
                  value={form.address_line1}
                  onChange={(e) => setForm({ ...form, address_line1: e.target.value })}
                  placeholder="Street, Office/Building"
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="city" className="text-xs font-medium">
                  City / Emirate
                </Label>
                <Input
                  id="city"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="Dubai, Abu Dhabi, etc."
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </div>
        </form>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/20 px-6 py-4">
          <div className="flex items-center gap-2">
            {mode === "edit" && party ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={runToggleStatus}
                  disabled={isPending}
                  className="h-9 cursor-pointer text-xs"
                >
                  {party.is_active ? "Deactivate" : "Reactivate"}
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
