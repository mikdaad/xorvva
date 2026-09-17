"use client";

import { useMemo, useState } from "react";
import { PartyFormModal, type PartyRow, type AccountOption, type TaxCodeOption } from "./party-form-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface PartiesClientProps {
  entityId: string;
  parties: PartyRow[];
  accounts: AccountOption[];
  taxCodes: TaxCodeOption[];
}

export function PartiesClient({ entityId, parties, accounts, taxCodes }: PartiesClientProps) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "customer" | "supplier" | "employee">("all");
  const [showInactive, setShowInactive] = useState(false);
  const [modalState, setModalState] = useState<{
    open: boolean;
    mode: "create" | "edit";
    party: PartyRow | null;
  }>({ open: false, mode: "create", party: null });

  const query = search.trim().toLowerCase();

  const filteredParties = useMemo(() => {
    return parties.filter((p) => {
      if (!showInactive && !p.is_active) return false;
      if (activeTab !== "all" && p.party_type !== activeTab && p.party_type !== "both") return false;

      if (!query) return true;
      return (
        p.name.toLowerCase().includes(query) ||
        (p.name_ar ?? "").toLowerCase().includes(query) ||
        (p.code ?? "").toLowerCase().includes(query) ||
        (p.trn ?? "").toLowerCase().includes(query) ||
        (p.email ?? "").toLowerCase().includes(query)
      );
    });
  }, [parties, query, activeTab, showInactive]);

  function openCreate() {
    setModalState({ open: true, mode: "create", party: null });
  }

  function openEdit(party: PartyRow) {
    setModalState({ open: true, mode: "edit", party });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by party name, code, TRN, or email…"
            className="h-9 w-full max-w-xs text-sm"
          />

          <div className="flex items-center rounded-lg border border-border bg-muted/20 p-1">
            <button
              onClick={() => setActiveTab("all")}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                activeTab === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setActiveTab("customer")}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                activeTab === "customer" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Customers
            </button>
            <button
              onClick={() => setActiveTab("supplier")}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                activeTab === "supplier" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Suppliers
            </button>
            <button
              onClick={() => setActiveTab("employee")}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                activeTab === "employee" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Employees
            </button>
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
          + Add Party
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-10 bg-muted/40 backdrop-blur">
            <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="px-6 py-2.5">Party Name</th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5">Code</th>
              <th className="px-3 py-2.5">TRN</th>
              <th className="px-3 py-2.5">Contact</th>
              <th className="px-3 py-2.5 text-right">Credit Limit</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-6 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filteredParties.map((party) => (
              <tr
                key={party.id}
                className={`group transition-colors hover:bg-muted/30 ${
                  party.is_active ? "" : "opacity-50"
                }`}
              >
                <td className="px-6 py-3">
                  <div className="font-medium text-sm text-foreground">{party.name}</div>
                  {party.name_ar ? (
                    <div className="text-xs text-muted-foreground" dir="rtl">
                      {party.name_ar}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  <Badge variant="outline" className="capitalize text-[11px]">
                    {party.party_type}
                  </Badge>
                </td>
                <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                  {party.code ?? "—"}
                </td>
                <td className="px-3 py-3 font-mono text-xs">
                  {party.trn ? (
                    <span className="text-emerald-400 font-medium">{party.trn}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-3 text-xs">
                  <div>{party.contact_person || party.email || "—"}</div>
                  {party.phone ? <div className="text-muted-foreground">{party.phone}</div> : null}
                </td>
                <td className="px-3 py-3 text-right font-mono text-xs">
                  {party.credit_limit ? `AED ${party.credit_limit.toLocaleString()}` : "—"}
                </td>
                <td className="px-3 py-3 text-xs">
                  {party.is_active ? (
                    <span className="text-[10px] font-medium text-emerald-400">Active</span>
                  ) : (
                    <span className="text-[10px] font-medium text-muted-foreground">Inactive</span>
                  )}
                </td>
                <td className="px-6 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => openEdit(party)}
                    className="cursor-pointer rounded px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredParties.length === 0 ? (
          <div className="p-16 text-center">
            <h3 className="text-sm font-bold">No parties found</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Try adjusting your search filter or click &quot;+ Add Party&quot; to create a new customer or supplier.
            </p>
          </div>
        ) : null}
      </div>

      {modalState.open ? (
        <PartyFormModal
          entityId={entityId}
          mode={modalState.mode}
          party={modalState.party}
          accounts={accounts}
          taxCodes={taxCodes}
          onClose={() => setModalState({ open: false, mode: "create", party: null })}
        />
      ) : null}
    </div>
  );
}
