"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { accountSchema, type AccountInput } from "@/lib/validations/account";
import type { AccountType, AccountSubType, DrCr } from "@/types/database.types";

export interface AccountActionResult {
  success: boolean;
  accountId?: string;
  error?: string;
}

/** A single node in the Chart of Accounts tree. */
export interface CoaNode {
  id: string;
  name: string;
  name_ar: string | null;
  code: string | null;
  parent_id: string | null;
  parent_name: string | null;
  level: number;
  is_group: boolean;
  is_system: boolean;
  is_control: boolean;
  is_bank: boolean;
  is_active: boolean;
  account_type: AccountType;
  account_sub_type: AccountSubType | null;
  opening_balance: number;
  opening_balance_type: DrCr;
  party_trn: string | null;
  place_of_supply: string | null;
  default_tax_code_id: string | null;
  /** True when the ledger has posted journal lines, so it cannot be deleted. */
  has_transactions: boolean;
  children: CoaNode[];
}

interface AccountRow {
  id: string;
  name: string;
  name_ar: string | null;
  code: string | null;
  parent_id: string | null;
  level: number;
  is_group: boolean;
  is_system: boolean;
  is_control: boolean;
  is_bank: boolean;
  is_active: boolean;
  account_type: AccountType;
  account_sub_type: AccountSubType | null;
  opening_balance: number | null;
  opening_balance_type: DrCr;
  party_trn: string | null;
  place_of_supply: string | null;
  default_tax_code_id: string | null;
}

/**
 * Loads the full chart for an entity and assembles it into a tree.
 *
 * Fetches the flat rowset in a single query and links it in memory rather than
 * issuing a query per level — a chart of a few hundred accounts is far cheaper
 * to assemble here than to walk recursively over the wire.
 */
export async function getChartOfAccounts(entityId: string): Promise<CoaNode[]> {
  const supabase = await createClient();

  const [accountsResult, postedResult] = await Promise.all([
    supabase
      .from("accounts")
      .select(
        `id, name, name_ar, code, parent_id, level, is_group, is_system, is_control,
         is_bank, is_active, account_type, account_sub_type, opening_balance,
         opening_balance_type, party_trn, place_of_supply, default_tax_code_id`
      )
      .eq("entity_id", entityId)
      .order("name"),
    // Which accounts carry postings — drives the "cannot delete" affordance.
    supabase.from("journal_lines").select("account_id").eq("entity_id", entityId),
  ]);

  const rows = (accountsResult.data ?? []) as unknown as AccountRow[];
  const postedAccountIds = new Set(
    ((postedResult.data ?? []) as { account_id: string }[]).map((l) => l.account_id)
  );

  const byId = new Map<string, CoaNode>();
  for (const row of rows) {
    byId.set(row.id, {
      ...row,
      parent_name: null,
      opening_balance: Number(row.opening_balance ?? 0),
      has_transactions: postedAccountIds.has(row.id),
      children: [],
    });
  }

  const roots: CoaNode[] = [];
  for (const node of byId.values()) {
    if (node.parent_id) {
      const parent = byId.get(node.parent_id);
      if (parent) {
        node.parent_name = parent.name;
        parent.children.push(node);
        continue;
      }
    }
    // A node whose parent is missing (or outside this entity) is shown at the
    // root rather than silently dropped.
    roots.push(node);
  }

  // Groups before ledgers, then alphabetical — Tally's display order.
  const sortNodes = (nodes: CoaNode[]) => {
    nodes.sort((a, b) => {
      if (a.is_group !== b.is_group) return a.is_group ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(roots);

  return roots;
}

/** Groups only — for the "Under" selector in the create/edit modal. */
export async function getAccountGroups(entityId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("accounts")
    .select("id, name, account_type, account_sub_type, level")
    .eq("entity_id", entityId)
    .eq("is_group", true)
    .eq("is_active", true)
    .order("name");

  return data ?? [];
}

export async function createAccount(input: AccountInput): Promise<AccountActionResult> {
  try {
    const validated = accountSchema.parse(input);
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "Authentication required." };

    // Derive level from the parent so the tree stays consistent even if the
    // client sends nothing useful.
    let level = 1;
    if (validated.parent_id) {
      const { data: parent } = await supabase
        .from("accounts")
        .select("level, is_group, entity_id")
        .eq("id", validated.parent_id)
        .maybeSingle();

      if (!parent) return { success: false, error: "Parent group not found." };
      if (!parent.is_group) {
        return { success: false, error: "Ledgers can only be created under a group." };
      }
      if (parent.entity_id !== validated.entity_id) {
        return { success: false, error: "Parent group belongs to a different company." };
      }
      level = (parent.level ?? 1) + 1;
    }

    const { data, error } = await supabase
      .from("accounts")
      .insert({
        entity_id: validated.entity_id,
        name: validated.name,
        name_ar: validated.name_ar || null,
        code: validated.code || null,
        parent_id: validated.parent_id,
        level,
        is_group: validated.is_group,
        is_bank: validated.is_bank,
        account_type: validated.account_type,
        account_sub_type: validated.account_sub_type ?? null,
        default_tax_code_id: validated.default_tax_code_id ?? null,
        place_of_supply: validated.place_of_supply ?? null,
        party_trn: validated.party_trn || null,
        opening_balance: validated.opening_balance,
        opening_balance_type: validated.opening_balance > 0 ? validated.opening_balance_type : null,
        description: validated.description || null,
        is_active: true,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) {
      // 23505 = unique_violation. The unique index is on (entity_id, lower(name)).
      if (error.code === "23505") {
        return {
          success: false,
          error: `A ledger or group named "${validated.name}" already exists in this company.`,
        };
      }
      return { success: false, error: error.message };
    }

    revalidatePath("/masters/chart-of-accounts");
    return { success: true, accountId: data.id };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: err.issues.map((i) => i.message).join(". ") };
    }
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateAccount(
  accountId: string,
  input: AccountInput
): Promise<AccountActionResult> {
  try {
    const validated = accountSchema.parse(input);
    const supabase = await createClient();

    // Guard against a group being re-pointed beneath its own descendant, which
    // would orphan a whole subtree into an unreachable cycle.
    if (validated.parent_id) {
      if (validated.parent_id === accountId) {
        return { success: false, error: "An account cannot be its own parent." };
      }
      const cycle = await createsCycle(accountId, validated.parent_id, validated.entity_id);
      if (cycle) {
        return { success: false, error: "That parent sits below this group — it would create a loop." };
      }
    }

    const { error } = await supabase
      .from("accounts")
      .update({
        name: validated.name,
        name_ar: validated.name_ar || null,
        code: validated.code || null,
        parent_id: validated.parent_id,
        account_type: validated.account_type,
        account_sub_type: validated.account_sub_type ?? null,
        is_bank: validated.is_bank,
        default_tax_code_id: validated.default_tax_code_id ?? null,
        place_of_supply: validated.place_of_supply ?? null,
        party_trn: validated.party_trn || null,
        opening_balance: validated.opening_balance,
        opening_balance_type: validated.opening_balance > 0 ? validated.opening_balance_type : null,
        description: validated.description || null,
      })
      .eq("id", accountId);

    if (error) {
      if (error.code === "23505") {
        return {
          success: false,
          error: `A ledger or group named "${validated.name}" already exists in this company.`,
        };
      }
      return { success: false, error: error.message };
    }

    revalidatePath("/masters/chart-of-accounts");
    return { success: true, accountId };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: err.issues.map((i) => i.message).join(". ") };
    }
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Walks up from `candidateParentId` looking for `accountId`. */
async function createsCycle(
  accountId: string,
  candidateParentId: string,
  entityId: string
): Promise<boolean> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("accounts")
    .select("id, parent_id")
    .eq("entity_id", entityId);

  const parentOf = new Map<string, string | null>(
    ((data ?? []) as { id: string; parent_id: string | null }[]).map((r) => [r.id, r.parent_id])
  );

  let cursor: string | null = candidateParentId;
  const seen = new Set<string>();

  while (cursor) {
    if (cursor === accountId) return true;
    if (seen.has(cursor)) break; // pre-existing cycle; stop rather than hang
    seen.add(cursor);
    cursor = parentOf.get(cursor) ?? null;
  }

  return false;
}

/**
 * Deactivates a ledger. This is the intended alternative to deletion.
 *
 * Tally never lets you erase a ledger that carries postings, because doing so
 * would break the audit trail. We mirror that: the UI offers deactivation, and
 * `delete_account` below refuses when postings exist.
 */
export async function deactivateAccount(accountId: string): Promise<AccountActionResult> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("accounts")
    .update({ is_active: false })
    .eq("id", accountId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/masters/chart-of-accounts");
  return { success: true, accountId };
}

export async function reactivateAccount(accountId: string): Promise<AccountActionResult> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("accounts")
    .update({ is_active: true })
    .eq("id", accountId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/masters/chart-of-accounts");
  return { success: true, accountId };
}

/**
 * Attempts a hard delete.
 *
 * The database trigger `prevent_account_delete` is the real enforcement point —
 * it blocks system accounts, accounts with posted journal lines, and non-empty
 * groups regardless of which code path calls DELETE. This action checks first
 * only so the user gets a clear message instead of a raw Postgres error.
 */
export async function deleteAccount(accountId: string): Promise<AccountActionResult> {
  const supabase = await createClient();

  const { count } = await supabase
    .from("journal_lines")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId);

  if ((count ?? 0) > 0) {
    return {
      success: false,
      error: `This ledger has ${count} posted transaction line(s) and cannot be deleted. Deactivate it instead to preserve the audit trail.`,
    };
  }

  const { error } = await supabase.from("accounts").delete().eq("id", accountId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/masters/chart-of-accounts");
  return { success: true, accountId };
}
