"use server";

import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JournalLineInput {
  account_id: string;
  party_id?: string | null;
  description?: string | null;
  debit_amount: number;
  credit_amount: number;
  cost_centre_id?: string | null;
}

export interface CreateManualJournalInput {
  entity_id: string;
  entry_date: string;
  period_id: string;
  narration: string;
  currency_code?: string;
  exchange_rate?: number;
  lines: JournalLineInput[];
  auto_post?: boolean;
}

export interface JournalActionResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * Creates a manual journal entry (JV type).
 * Validates that debits = credits before inserting.
 */
export async function createManualJournal(
  input: CreateManualJournalInput
): Promise<JournalActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const exchangeRate = input.exchange_rate ?? 1;

    // Pre-validate balance on the client side (DB trigger is the real guard)
    const totalDebit = input.lines.reduce((s, l) => s + l.debit_amount, 0);
    const totalCredit = input.lines.reduce((s, l) => s + l.credit_amount, 0);

    if (Math.abs(totalDebit - totalCredit) > 0.0001) {
      return {
        success: false,
        error: `Journal entry is not balanced. Total debit (${totalDebit}) ≠ Total credit (${totalCredit}).`,
      };
    }

    if (input.lines.length < 2) {
      return { success: false, error: "Journal entry must have at least 2 lines." };
    }

    // 1. Generate entry number
    const { data: entryNumber, error: seqErr } = await supabase.rpc(
      "generate_voucher_number",
      {
        p_entity_id: input.entity_id,
        p_voucher_type: "journal_voucher",
      }
    );
    if (seqErr) return { success: false, error: seqErr.message };

    // 2. Create the journal entry
    const status = input.auto_post ? "posted" as const : "draft" as const;
    const { data: je, error: jeErr } = await supabase
      .from("journal_entries")
      .insert({
        entity_id: input.entity_id,
        entry_number: entryNumber as string,
        entry_date: input.entry_date,
        period_id: input.period_id,
        source: "voucher" as const,
        narration: input.narration,
        currency_code: input.currency_code ?? "AED",
        exchange_rate: exchangeRate,
        status,
        posted_at: input.auto_post ? new Date().toISOString() : null,
        posted_by: input.auto_post ? user.id : null,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (jeErr) return { success: false, error: jeErr.message };

    // 3. Insert journal lines
    const lineInserts = input.lines.map((line, idx) => ({
      journal_entry_id: je.id,
      entity_id: input.entity_id,
      line_number: idx + 1,
      account_id: line.account_id,
      party_id: line.party_id,
      description: line.description,
      debit_amount: line.debit_amount,
      credit_amount: line.credit_amount,
      base_debit: Math.round(line.debit_amount * exchangeRate * 10000) / 10000,
      base_credit: Math.round(line.credit_amount * exchangeRate * 10000) / 10000,
      cost_centre_id: line.cost_centre_id,
      created_by: user.id,
    }));

    const { error: jlErr } = await supabase
      .from("journal_lines")
      .insert(lineInserts);

    if (jlErr) return { success: false, error: jlErr.message };

    return { success: true, data: { id: je.id, entry_number: entryNumber } };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Fetches a trial balance for an entity within a date range.
 * Groups journal lines by account and sums debits/credits.
 */
export async function getTrialBalance(params: {
  entity_id: string;
  from_date?: string;
  to_date?: string;
  period_id?: string;
}) {
  const supabase = await createClient();

  // Fetch all posted journal entries for the entity
  let jeQuery = supabase
    .from("journal_entries")
    .select("id")
    .eq("entity_id", params.entity_id)
    .eq("status", "posted");

  if (params.period_id) {
    jeQuery = jeQuery.eq("period_id", params.period_id);
  }
  if (params.from_date) {
    jeQuery = jeQuery.gte("entry_date", params.from_date);
  }
  if (params.to_date) {
    jeQuery = jeQuery.lte("entry_date", params.to_date);
  }

  const { data: entries, error: jeErr } = await jeQuery;
  if (jeErr) return { data: null, error: jeErr.message };
  if (!entries || entries.length === 0) {
    return { data: [], error: null };
  }

  const entryIds = entries.map((e) => e.id);

  // Fetch all lines for those entries
  const { data: lines, error: lErr } = await supabase
    .from("journal_lines")
    .select("account_id, base_debit, base_credit")
    .in("journal_entry_id", entryIds);

  if (lErr) return { data: null, error: lErr.message };

  // Aggregate by account
  const accountMap = new Map<string, { debit: number; credit: number }>();
  for (const line of lines ?? []) {
    const existing = accountMap.get(line.account_id) ?? { debit: 0, credit: 0 };
    existing.debit += line.base_debit;
    existing.credit += line.base_credit;
    accountMap.set(line.account_id, existing);
  }

  // Fetch account details
  const accountIds = [...accountMap.keys()];
  const { data: accounts } = accountIds.length > 0
    ? await supabase
        .from("accounts")
        .select("id, code, name, account_type")
        .in("id", accountIds)
    : { data: [] as { id: string; code: string; name: string; account_type: string }[] };

  const trialBalance = (accounts ?? []).map((acc) => {
    const totals = accountMap.get(acc.id) ?? { debit: 0, credit: 0 };
    return {
      account_id: acc.id,
      account_code: acc.code,
      account_name: acc.name,
      account_type: acc.account_type,
      total_debit: Math.round(totals.debit * 10000) / 10000,
      total_credit: Math.round(totals.credit * 10000) / 10000,
      balance: Math.round((totals.debit - totals.credit) * 10000) / 10000,
    };
  });

  // Sort by account code (null codes sort last, before accounts without codes)
  trialBalance.sort((a, b) => (a.account_code ?? "zzzz").localeCompare(b.account_code ?? "zzzz"));

  return { data: trialBalance, error: null };
}
