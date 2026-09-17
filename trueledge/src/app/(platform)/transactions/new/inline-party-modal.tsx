"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { createPartyInline } from "@/lib/actions/parties";
import { Label } from "@/components/ui/label";
import { SmartCombobox } from "@/components/ui/smart-combobox";
import type { AccountOption, PartyOption } from "@/lib/vouchers/entry-options";
import { InlineModalFooter, InlineModalShell } from "./inline-modal-shell";

/** Party kinds offerable inline; "employee" is a masters-screen concern. */
const INLINE_PARTY_TYPES = [
  { value: "customer", label: "Customer" },
  { value: "supplier", label: "Supplier" },
  { value: "both", label: "Customer & Supplier" },
] as const;

type InlinePartyType = (typeof INLINE_PARTY_TYPES)[number]["value"];

/**
 * Guesses the receivable/payable control ledger so the accountant usually just
 * presses Ctrl+Enter. Falls back to leaving the field empty rather than picking
 * an unrelated ledger.
 */
function guessControlAccount(
  accounts: AccountOption[],
  partyType: InlinePartyType
): string {
  const wanted = partyType === "supplier" ? "creditor" : "debtor";
  const byName = accounts.find((a) => a.name.toLowerCase().includes(wanted));
  if (byName) return byName.id;

  const type = partyType === "supplier" ? "liability" : "asset";
  const byType = accounts.find((a) => a.account_type.toLowerCase().includes(type));
  return byType?.id ?? "";
}

export function InlinePartyModal({
  entityId,
  initialName,
  initialPartyType,
  accounts,
  onCreated,
  onClose,
}: {
  entityId: string;
  /** Seeded from the combobox search term. */
  initialName: string;
  initialPartyType: InlinePartyType;
  accounts: AccountOption[];
  onCreated: (party: PartyOption) => void;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [name, setName] = useState(initialName);
  const [partyType, setPartyType] = useState<InlinePartyType>(initialPartyType);
  const [controlAccountId, setControlAccountId] = useState(() =>
    guessControlAccount(accounts, initialPartyType)
  );
  const [trn, setTrn] = useState("");

  const ledgerHint = useMemo(() => {
    const selected = accounts.find((a) => a.id === controlAccountId);
    if (!selected) return "Receivable ledger for customers, payable for suppliers.";
    return `Voucher lines will auto-fill with ${selected.name}.`;
  }, [accounts, controlAccountId]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createPartyInline({
        entity_id: entityId,
        name,
        party_type: partyType,
        control_account_id: controlAccountId,
        trn: trn || undefined,
      });

      if (!result.success || !result.party) {
        setError(result.error ?? "Could not create the party.");
        return;
      }

      onCreated(result.party);
    });
  }

  return (
    <InlineModalShell
      title="Create Party"
      description="Minimum details to keep the voucher moving. Finish the record later in Masters."
      labelledBy="inline-party-title"
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
          <Label htmlFor="inline-party-name" className="text-xs">
            Party Name <span className="text-destructive">*</span>
          </Label>
          <input
            id="inline-party-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoComplete="off"
            className="h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="inline-party-type" className="text-xs">
              Party Type <span className="text-destructive">*</span>
            </Label>
            <select
              id="inline-party-type"
              value={partyType}
              onChange={(event) => {
                const next = event.target.value as InlinePartyType;
                setPartyType(next);
                // Re-guess only while the accountant has not overridden the
                // ledger, so switching type does not discard a manual pick.
                setControlAccountId((current) =>
                  current === "" || current === guessControlAccount(accounts, partyType)
                    ? guessControlAccount(accounts, next)
                    : current
                );
              }}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              {INLINE_PARTY_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inline-party-trn" className="text-xs">
              TRN <span className="text-muted-foreground">(optional)</span>
            </Label>
            <input
              id="inline-party-trn"
              value={trn}
              onChange={(event) => setTrn(event.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              maxLength={15}
              placeholder="15 digits"
              aria-describedby="inline-party-trn-hint"
              className="h-9 w-full rounded-md border bg-background px-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <p id="inline-party-trn-hint" className="text-[11px] text-muted-foreground">
              {trn.length > 0 && trn.length < 15
                ? `${15 - trn.length} more digit${15 - trn.length === 1 ? "" : "s"} — sets VAT registered.`
                : "Leave blank for an unregistered consumer."}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="inline-party-ledger" className="text-xs">
            Default Ledger <span className="text-destructive">*</span>
          </Label>
          <SmartCombobox
            id="inline-party-ledger"
            aria-label="Default ledger"
            items={accounts}
            value={controlAccountId}
            onChange={setControlAccountId}
            getLabel={(account) => account.name}
            getHint={(account) => account.code}
            placeholder="Sundry Debtors / Sundry Creditors…"
            emptyMessage="No matching ledger"
          />
          <p className="text-[11px] text-muted-foreground">{ledgerHint}</p>
        </div>
        </div>

        <InlineModalFooter isPending={isPending} submitLabel="Create Party" onClose={onClose} />
      </form>
    </InlineModalShell>
  );
}

export type { InlinePartyType };
