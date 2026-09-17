"use client";

import { useMemo, useState } from "react";
import type { CoaNode } from "@/lib/actions/accounts";
import { normalBalance } from "@/lib/validations/account";
import { AccountFormModal, type GroupOption, type TaxCodeOption } from "./account-form-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ChartOfAccountsClientProps {
  entityId: string;
  tree: CoaNode[];
  groups: GroupOption[];
  taxCodes: TaxCodeOption[];
  baseCurrency: string;
}

export function ChartOfAccountsClient({
  entityId,
  tree,
  groups,
  taxCodes,
  baseCurrency,
}: ChartOfAccountsClientProps) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showInactive, setShowInactive] = useState(false);
  const [modalState, setModalState] = useState<{
    open: boolean;
    mode: "create" | "edit";
    isGroup: boolean;
    parentId: string | null;
    account: CoaNode | null;
  }>({ open: false, mode: "create", isGroup: false, parentId: null, account: null });

  const query = search.trim().toLowerCase();

  // Filtering keeps any node that matches, plus its ancestors, so a hit deep in
  // the tree stays reachable rather than appearing detached at the root.
  const { visible, matchedIds } = useMemo(() => {
    const matched = new Set<string>();

    const walk = (nodes: CoaNode[]): CoaNode[] => {
      const out: CoaNode[] = [];

      for (const node of nodes) {
        if (!showInactive && !node.is_active) continue;

        const children = walk(node.children);
        const selfMatches =
          !query ||
          node.name.toLowerCase().includes(query) ||
          (node.name_ar ?? "").toLowerCase().includes(query) ||
          (node.code ?? "").toLowerCase().includes(query);

        if (selfMatches) matched.add(node.id);

        if (selfMatches || children.length > 0) {
          out.push({ ...node, children });
        }
      }

      return out;
    };

    return { visible: walk(tree), matchedIds: matched };
  }, [tree, query, showInactive]);

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openCreate(isGroup: boolean, parentId: string | null) {
    setModalState({ open: true, mode: "create", isGroup, parentId, account: null });
  }

  function openEdit(account: CoaNode) {
    setModalState({
      open: true,
      mode: "edit",
      isGroup: account.is_group,
      parentId: account.parent_id,
      account,
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ledgers and groups…"
          aria-label="Search chart of accounts"
          className="h-9 w-full max-w-sm text-sm"
        />

        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-3.5 w-3.5 cursor-pointer accent-emerald-600"
          />
          Show inactive
        </label>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => openCreate(true, null)}
            className="h-9 cursor-pointer text-xs"
          >
            + Create Group
          </Button>
          <Button
            onClick={() => openCreate(false, null)}
            className="h-9 cursor-pointer bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            + Create Ledger
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-10 bg-muted/40 backdrop-blur">
            <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="px-6 py-2.5">Name</th>
              <th className="px-3 py-2.5">Code</th>
              <th className="px-3 py-2.5">Under Group</th>
              <th className="px-3 py-2.5">Normal Balance</th>
              <th className="px-3 py-2.5 text-right">Opening</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-6 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {visible.map((node) => (
              <TreeRow
                key={node.id}
                node={node}
                depth={0}
                collapsed={collapsed}
                onToggle={toggle}
                onEdit={openEdit}
                onAddChild={openCreate}
                matchedIds={matchedIds}
                hasQuery={query.length > 0}
                baseCurrency={baseCurrency}
              />
            ))}
          </tbody>
        </table>

        {visible.length === 0 ? (
          <div className="p-16 text-center">
            <h3 className="text-sm font-bold">No accounts match “{search}”</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Try a different term, or create a new ledger.
            </p>
          </div>
        ) : null}
      </div>

      {modalState.open ? (
        <AccountFormModal
          entityId={entityId}
          mode={modalState.mode}
          isGroup={modalState.isGroup}
          parentId={modalState.parentId}
          account={modalState.account}
          groups={groups}
          taxCodes={taxCodes}
          onClose={() => setModalState((s) => ({ ...s, open: false }))}
        />
      ) : null}
    </div>
  );
}

interface TreeRowProps {
  node: CoaNode;
  depth: number;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onEdit: (node: CoaNode) => void;
  onAddChild: (isGroup: boolean, parentId: string | null) => void;
  matchedIds: Set<string>;
  hasQuery: boolean;
  baseCurrency: string;
}

function TreeRow({
  node,
  depth,
  collapsed,
  onToggle,
  onEdit,
  onAddChild,
  matchedIds,
  hasQuery,
  baseCurrency,
}: TreeRowProps) {
  // While searching, keep everything expanded so matches are visible without
  // the user having to re-open branches by hand.
  const isCollapsed = !hasQuery && collapsed.has(node.id);
  const hasChildren = node.children.length > 0;
  const isMatch = matchedIds.has(node.id);

  return (
    <>
      <tr
        className={`group transition-colors hover:bg-muted/30 ${
          node.is_active ? "" : "opacity-50"
        } ${hasQuery && isMatch ? "bg-emerald-500/5" : ""}`}
      >
        <td className="px-6 py-2">
          <div className="flex items-center" style={{ paddingLeft: depth * 18 }}>
            {hasChildren ? (
              <button
                type="button"
                onClick={() => onToggle(node.id)}
                aria-label={isCollapsed ? "Expand" : "Collapse"}
                aria-expanded={!isCollapsed}
                className="mr-1 flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  className={`h-3 w-3 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            ) : (
              <span className="mr-1 w-4 shrink-0" />
            )}

            <span
              className={
                node.is_group
                  ? "text-sm font-bold text-foreground"
                  : "text-sm text-foreground"
              }
            >
              {node.name}
            </span>

            {node.name_ar ? (
              <span className="ml-2 text-xs text-muted-foreground" dir="rtl">
                {node.name_ar}
              </span>
            ) : null}

            {node.is_system ? (
              <span className="ml-2 rounded border border-border px-1 text-[9px] font-bold uppercase text-muted-foreground">
                System
              </span>
            ) : null}
            {node.is_control ? (
              <span className="ml-2 rounded border border-sky-500/30 bg-sky-500/10 px-1 text-[9px] font-bold uppercase text-sky-400">
                Control
              </span>
            ) : null}
            {node.is_bank ? (
              <span className="ml-2 rounded border border-violet-500/30 bg-violet-500/10 px-1 text-[9px] font-bold uppercase text-violet-400">
                Bank
              </span>
            ) : null}
          </div>
        </td>

        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{node.code ?? "—"}</td>
        <td className="px-3 py-2 text-xs text-muted-foreground">{node.parent_name ?? "— Primary —"}</td>
        <td className="px-3 py-2">
          <span
            className={`text-xs font-semibold ${
              normalBalance(node.account_type) === "Dr" ? "text-sky-400" : "text-amber-400"
            }`}
          >
            {normalBalance(node.account_type)}
          </span>
        </td>
        <td className="px-3 py-2 text-right font-mono text-xs">
          {node.opening_balance > 0
            ? `${baseCurrency} ${node.opening_balance.toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })} ${node.opening_balance_type ?? ""}`
            : "—"}
        </td>
        <td className="px-3 py-2">
          {node.is_active ? (
            <span className="text-[10px] font-medium text-emerald-400">Active</span>
          ) : (
            <span className="text-[10px] font-medium text-muted-foreground">Inactive</span>
          )}
        </td>

        <td className="px-6 py-2 text-right">
          <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            {node.is_group ? (
              <button
                type="button"
                onClick={() => onAddChild(false, node.id)}
                title="Create a ledger under this group"
                className="cursor-pointer rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                + Ledger
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onEdit(node)}
              className="cursor-pointer rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Edit
            </button>
          </div>
        </td>
      </tr>

      {!isCollapsed
        ? node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              onToggle={onToggle}
              onEdit={onEdit}
              onAddChild={onAddChild}
              matchedIds={matchedIds}
              hasQuery={hasQuery}
              baseCurrency={baseCurrency}
            />
          ))
        : null}
    </>
  );
}
