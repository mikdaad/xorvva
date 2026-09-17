"use server";

import { createClient } from "@/lib/supabase/server";
import { requireActiveEntity } from "@/lib/entity-context";
import type {
  ReportFilters,
  BalanceSheetResult,
  BalanceSheetNode,
  BalanceSheetSectionResult,
  LedgerStatement,
  LedgerLine,
  TransactionRegisterResult,
  TransactionRegisterRow,
} from "@/lib/reports/types";
import type { AccountType, VoucherStatus, VoucherType } from "@/types/database.types";
import { voucherStatusLabel, voucherTypeLabel } from "@/lib/reports/labels";

/**
 * Resolves the target entity ID for server actions.
 * First checks active session cookie, falls back to the user's first active entity membership.
 */
async function resolveEntityId(overrideId?: string | null): Promise<{
  entityId: string;
  entityName: string;
  baseCurrency: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized: User session not found.");
  }

  let targetId = overrideId;

  if (!targetId) {
    targetId = await requireActiveEntity();
  }

  if (!targetId) {
    const { data: userEntities } = await supabase
      .from("entity_users")
      .select("entity_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1);

    if (userEntities && userEntities.length > 0) {
      targetId = userEntities[0].entity_id;
    }
  }

  if (!targetId) {
    throw new Error("No accessible entity found for current user.");
  }

  // Verify membership
  const { data: membership } = await supabase
    .from("entity_users")
    .select("entity_id")
    .eq("entity_id", targetId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!membership) {
    throw new Error("Forbidden: You do not have active access to this entity.");
  }

  const { data: entity } = await supabase
    .from("entities")
    .select("legal_name, trade_name, base_currency")
    .eq("id", targetId)
    .single();

  return {
    entityId: targetId,
    entityName: entity?.legal_name || entity?.trade_name || "Company",
    baseCurrency: entity?.base_currency || "AED",
  };
}

// ---------------------------------------------------------------------------
// 1. Dynamic Balance Sheet Action
// ---------------------------------------------------------------------------

export async function getBalanceSheet(
  asOfDate?: string | null,
  entityIdOverride?: string | null
): Promise<BalanceSheetResult> {
  const { entityId, entityName, baseCurrency } = await resolveEntityId(entityIdOverride);
  const supabase = await createClient();

  const asOf = asOfDate && !isNaN(Date.parse(asOfDate))
    ? asOfDate
    : new Date().toISOString().split("T")[0];

  // Fetch accounts and posted journal lines up to asOf
  const [accountsRes, postedLinesRes] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, code, parent_id, is_group, account_type, account_sub_type, opening_balance, opening_balance_type")
      .eq("entity_id", entityId)
      .eq("is_active", true)
      .order("code", { ascending: true })
      .order("name", { ascending: true }),

    supabase
      .from("journal_lines")
      .select("account_id, base_debit, base_credit, journal_entries!inner(status, entry_date)")
      .eq("entity_id", entityId)
      .eq("journal_entries.status", "posted")
      .lte("journal_entries.entry_date", asOf),
  ]);

  if (accountsRes.error) {
    throw new Error(`Failed to fetch accounts: ${accountsRes.error.message}`);
  }

  const accounts = accountsRes.data ?? [];
  const postedLines = (postedLinesRes.data ?? []) as unknown as {
    account_id: string;
    base_debit: number;
    base_credit: number;
  }[];

  // Aggregate posted totals per account
  const postedMap = new Map<string, { debit: number; credit: number }>();
  for (const line of postedLines) {
    const curr = postedMap.get(line.account_id) || { debit: 0, credit: 0 };
    curr.debit += Number(line.base_debit || 0);
    curr.credit += Number(line.base_credit || 0);
    postedMap.set(line.account_id, curr);
  }

  // Compute individual account balances & Retained Earnings
  let totalRevenueCr = 0;
  let totalExpenseDr = 0;

  type AccCalc = {
    id: string;
    name: string;
    code: string | null;
    parentId: string | null;
    isGroup: boolean;
    accountType: AccountType;
    accountSubType: string | null;
    netAmount: number; // Section-natural amount
  };

  const accountCalcMap = new Map<string, AccCalc>();

  for (const acc of accounts) {
    const posted = postedMap.get(acc.id) || { debit: 0, credit: 0 };
    let opDr = 0;
    let opCr = 0;
    if (acc.opening_balance_type === "Dr") {
      opDr = Number(acc.opening_balance || 0);
    } else if (acc.opening_balance_type === "Cr") {
      opCr = Number(acc.opening_balance || 0);
    }

    const totalDr = opDr + posted.debit;
    const totalCr = opCr + posted.credit;

    // Calculate natural net amount depending on type
    let netAmount = 0;
    if (acc.account_type === "asset") {
      netAmount = totalDr - totalCr;
    } else if (acc.account_type === "liability" || acc.account_type === "equity") {
      netAmount = totalCr - totalDr;
    } else if (acc.account_type === "revenue") {
      const revNet = totalCr - totalDr;
      totalRevenueCr += revNet;
      netAmount = revNet;
    } else if (acc.account_type === "expense") {
      const expNet = totalDr - totalCr;
      totalExpenseDr += expNet;
      netAmount = expNet;
    }

    accountCalcMap.set(acc.id, {
      id: acc.id,
      name: acc.name,
      code: acc.code,
      parentId: acc.parent_id,
      isGroup: acc.is_group,
      accountType: acc.account_type,
      accountSubType: acc.account_sub_type,
      netAmount,
    });
  }

  // Dynamic Retained Earnings = Net Revenue minus Net Expense
  const retainedEarnings = totalRevenueCr - totalExpenseDr;

  // Function to build tree nodes for a specific account_type
  function buildSectionTree(accType: "asset" | "liability" | "equity"): BalanceSheetSectionResult {
    const sectionAccounts = Array.from(accountCalcMap.values()).filter(
      (a) => a.accountType === accType
    );

    const nodeMap = new Map<string, BalanceSheetNode>();

    // First pass: create node objects for non-group items with non-zero amounts or groups
    for (const a of sectionAccounts) {
      nodeMap.set(a.id, {
        id: a.id,
        name: a.name,
        code: a.code,
        isGroup: a.isGroup,
        amount: a.netAmount,
        drillAccountId: a.isGroup ? null : a.id,
        children: [],
      });
    }

    // Assemble hierarchy
    const rootNodes: BalanceSheetNode[] = [];
    for (const a of sectionAccounts) {
      const node = nodeMap.get(a.id)!;
      if (a.parentId && nodeMap.has(a.parentId)) {
        nodeMap.get(a.parentId)!.children.push(node);
      } else {
        rootNodes.push(node);
      }
    }

    // Rollup amounts from children to group parents
    function rollup(node: BalanceSheetNode): number {
      if (node.children.length > 0) {
        let sum = node.isGroup ? 0 : node.amount;
        for (const child of node.children) {
          sum += rollup(child);
        }
        node.amount = sum;
      }
      return node.amount;
    }

    for (const root of rootNodes) {
      rollup(root);
    }

    // Filter out zero-amount leaf nodes & empty groups
    function filterNonZero(nodes: BalanceSheetNode[]): BalanceSheetNode[] {
      return nodes
        .map((n) => ({
          ...n,
          children: filterNonZero(n.children),
        }))
        .filter((n) => Math.abs(n.amount) > 0.001 || n.children.length > 0);
    }

    let filteredRoots = filterNonZero(rootNodes);

    // If section is Equity, inject Retained Earnings node
    if (accType === "equity") {
      filteredRoots.push({
        id: "retained-earnings-node",
        name: "Retained Earnings (Net Profit/Loss)",
        code: "3999",
        isGroup: false,
        amount: retainedEarnings,
        drillAccountId: null,
        children: [],
      });
    }

    const total = filteredRoots.reduce((sum, n) => sum + n.amount, 0);

    return {
      total,
      nodes: filteredRoots,
    };
  }

  const assets = buildSectionTree("asset");
  const liabilities = buildSectionTree("liability");
  const equity = buildSectionTree("equity");

  const totalAssets = assets.total;
  const totalLiabilitiesAndEquity = liabilities.total + equity.total;
  const difference = totalAssets - totalLiabilitiesAndEquity;

  return {
    entityId,
    entityName,
    baseCurrency,
    asOf,
    assets,
    liabilities,
    equity,
    retainedEarnings,
    totalAssets,
    totalLiabilitiesAndEquity,
    difference,
  };
}

// ---------------------------------------------------------------------------
// 2. Ledger Statement Action
// ---------------------------------------------------------------------------

export async function getLedgerStatement(
  filters: ReportFilters,
  entityIdOverride?: string | null
): Promise<LedgerStatement> {
  const { entityId, entityName, baseCurrency } = await resolveEntityId(entityIdOverride);
  const supabase = await createClient();

  if (!filters.accountId) {
    throw new Error("Account ID is required for ledger statement.");
  }

  const accountId = filters.accountId;
  const from = filters.dateRange?.from || null;
  const to = filters.dateRange?.to || null;

  // 1. Fetch target account details
  const { data: account, error: accErr } = await supabase
    .from("accounts")
    .select("id, name, code, account_type, opening_balance, opening_balance_type")
    .eq("id", accountId)
    .single();

  if (accErr || !account) {
    throw new Error(`Account not found: ${accErr?.message || accountId}`);
  }

  // 2. Calculate Opening Balance prior to `from`
  let opDr = 0;
  let opCr = 0;
  if (account.opening_balance_type === "Dr") {
    opDr = Number(account.opening_balance || 0);
  } else if (account.opening_balance_type === "Cr") {
    opCr = Number(account.opening_balance || 0);
  }

  let priorDebit = 0;
  let priorCredit = 0;

  if (from) {
    const { data: priorLines } = await supabase
      .from("journal_lines")
      .select("base_debit, base_credit, journal_entries!inner(status, entry_date)")
      .eq("account_id", accountId)
      .eq("journal_entries.status", "posted")
      .lt("journal_entries.entry_date", from);

    if (priorLines) {
      for (const pl of priorLines as unknown as { base_debit: number; base_credit: number }[]) {
        priorDebit += Number(pl.base_debit || 0);
        priorCredit += Number(pl.base_credit || 0);
      }
    }
  }

  // Dr-positive opening balance
  const openingBalance = (opDr + priorDebit) - (opCr + priorCredit);

  // 3. Fetch journal lines in date window
  let query = supabase
    .from("journal_lines")
    .select("id, base_debit, base_credit, description, journal_entries!inner(entry_number, entry_date, status, narration)")
    .eq("account_id", accountId)
    .eq("journal_entries.status", "posted")
    .order("journal_entries(entry_date)", { ascending: true });

  if (from) {
    query = query.gte("journal_entries.entry_date", from);
  }
  if (to) {
    query = query.lte("journal_entries.entry_date", to);
  }

  const { data: lineRows, error: linesErr } = await query;
  if (linesErr) {
    throw new Error(`Failed to fetch ledger lines: ${linesErr.message}`);
  }

  let currentRunning = openingBalance;
  let totalDebit = 0;
  let totalCredit = 0;

  const lines: LedgerLine[] = (lineRows || []).map((row: any) => {
    const dr = Number(row.base_debit || 0);
    const cr = Number(row.base_credit || 0);
    totalDebit += dr;
    totalCredit += cr;
    currentRunning = currentRunning + dr - cr;

    const entry = row.journal_entries;
    return {
      date: entry.entry_date,
      entryNumber: entry.entry_number,
      narration: row.description || entry.narration || null,
      debit: dr,
      credit: cr,
      runningBalance: currentRunning,
    };
  });

  const closingBalance = openingBalance + totalDebit - totalCredit;

  return {
    entityId,
    entityName,
    baseCurrency,
    accountId: account.id,
    accountName: account.name,
    accountCode: account.code,
    from,
    to,
    openingBalance,
    lines,
    totalDebit,
    totalCredit,
    closingBalance,
  };
}

// ---------------------------------------------------------------------------
// 3. Unified Voucher Register (Daybook) Action
// ---------------------------------------------------------------------------

export async function getTransactionRegister(
  filters: ReportFilters,
  entityIdOverride?: string | null
): Promise<TransactionRegisterResult> {
  const { entityId, entityName, baseCurrency } = await resolveEntityId(entityIdOverride);
  const supabase = await createClient();

  let query = supabase
    .from("vouchers")
    .select(`
      id,
      voucher_date,
      voucher_number,
      voucher_type,
      status,
      currency_code,
      base_total_amount,
      reference,
      narration,
      created_by,
      parties ( name )
    `)
    .eq("entity_id", entityId)
    .order("voucher_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters.voucherType && filters.voucherType !== "all") {
    query = query.eq("voucher_type", filters.voucherType);
  }
  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.partyId) {
    query = query.eq("party_id", filters.partyId);
  }
  if (filters.dateRange?.from) {
    query = query.gte("voucher_date", filters.dateRange.from);
  }
  if (filters.dateRange?.to) {
    query = query.lte("voucher_date", filters.dateRange.to);
  }

  const { data: vouchers, error: vErr } = await query;
  if (vErr) {
    throw new Error(`Failed to fetch transactions: ${vErr.message}`);
  }

  // Collect creator user IDs for batch lookup
  const creatorIds = Array.from(
    new Set((vouchers || []).map((v) => v.created_by).filter(Boolean) as string[])
  );

  const creatorNameMap = new Map<string, string>();
  if (creatorIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, full_name, email")
      .in("id", creatorIds);

    if (users) {
      for (const u of users) {
        creatorNameMap.set(u.id, u.full_name || u.email);
      }
    }
  }

  let totalBaseAmount = 0;
  const rows: TransactionRegisterRow[] = (vouchers || []).map((v: any) => {
    const baseAmt = Number(v.base_total_amount || 0);
    totalBaseAmount += baseAmt;

    const party = Array.isArray(v.parties) ? v.parties[0] : v.parties;
    const creatorName = v.created_by ? creatorNameMap.get(v.created_by) || null : null;

    return {
      id: v.id,
      date: v.voucher_date,
      voucherNumber: v.voucher_number,
      voucherType: v.voucher_type as VoucherType,
      typeLabel: voucherTypeLabel(v.voucher_type as VoucherType),
      partyName: party?.name || null,
      reference: v.reference || v.narration || null,
      status: v.status as VoucherStatus,
      statusLabel: voucherStatusLabel(v.status as VoucherStatus),
      currency: v.currency_code || "AED",
      baseAmount: baseAmt,
      createdBy: creatorName,
    };
  });

  return {
    entityId,
    entityName,
    baseCurrency,
    filters,
    rows,
    totalBaseAmount,
  };
}
