"use server";

import { createClient } from "@/lib/supabase/server";
import type { VoucherType, VoucherStatus } from "@/types/database.types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VoucherLineInput {
  item_id?: string | null;
  account_id: string;
  description?: string | null;
  quantity: number;
  unit_price: number;
  discount_pct?: number;
  tax_code_id?: string | null;
  tax_rate?: number;
  cost_centre_id?: string | null;
}

export interface CreateVoucherInput {
  entity_id: string;
  voucher_type: VoucherType;
  party_id?: string | null;
  voucher_date: string;
  due_date?: string | null;
  supply_date?: string | null;
  currency_code?: string;
  exchange_rate?: number;
  reference?: string | null;
  narration?: string | null;
  terms_and_conditions?: string | null;
  internal_notes?: string | null;
  place_of_supply?: string | null;
  buyer_trn?: string | null;
  seller_trn?: string | null;
  lines: VoucherLineInput[];
}

export interface VoucherActionResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeLineAmounts(
  line: VoucherLineInput,
  exchangeRate: number
) {
  const qty = line.quantity;
  const price = line.unit_price;
  const discPct = line.discount_pct ?? 0;
  const taxRate = line.tax_rate ?? 0;

  // line_amount = qty * price * (1 - discount%)
  const lineAmount = Math.round(qty * price * (1 - discPct / 100) * 10000) / 10000;
  const taxAmount = Math.round(lineAmount * (taxRate / 100) * 10000) / 10000;
  const lineTotal = Math.round((lineAmount + taxAmount) * 10000) / 10000;

  // Base currency (AED) equivalents
  const baseLineAmount = Math.round(lineAmount * exchangeRate * 10000) / 10000;
  const baseTaxAmount = Math.round(taxAmount * exchangeRate * 10000) / 10000;
  const baseLineTotal = Math.round(lineTotal * exchangeRate * 10000) / 10000;

  return {
    line_amount: lineAmount,
    tax_amount: taxAmount,
    line_total: lineTotal,
    base_line_amount: baseLineAmount,
    base_tax_amount: baseTaxAmount,
    base_line_total: baseLineTotal,
  };
}

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * Creates a new draft voucher with its lines.
 * Auto-generates the voucher number.
 */
export async function createVoucher(
  input: CreateVoucherInput
): Promise<VoucherActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const exchangeRate = input.exchange_rate ?? 1;

    // 1. Generate voucher number via the DB function
    const { data: voucherNumber, error: seqError } = await supabase.rpc(
      "generate_voucher_number",
      {
        p_entity_id: input.entity_id,
        p_voucher_type: input.voucher_type,
      }
    );
    if (seqError) return { success: false, error: seqError.message };

    // 2. Compute line amounts
    const computedLines = input.lines.map((line, idx) => ({
      ...line,
      ...computeLineAmounts(line, exchangeRate),
      line_number: idx + 1,
      sort_order: idx,
      entity_id: input.entity_id,
      tax_rate: line.tax_rate ?? 0,
      created_by: user.id,
    }));

    // 3. Compute voucher totals
    const subtotal = computedLines.reduce((sum, l) => sum + l.line_amount, 0);
    const taxTotal = computedLines.reduce((sum, l) => sum + l.tax_amount, 0);
    const totalAmount = computedLines.reduce((sum, l) => sum + l.line_total, 0);
    const baseSubtotal = computedLines.reduce((sum, l) => sum + l.base_line_amount, 0);
    const baseTaxTotal = computedLines.reduce((sum, l) => sum + l.base_tax_amount, 0);
    const baseTotalAmount = computedLines.reduce((sum, l) => sum + l.base_line_total, 0);

    // 4. Insert voucher
    const { data: voucher, error: vError } = await supabase
      .from("vouchers")
      .insert({
        entity_id: input.entity_id,
        voucher_type: input.voucher_type,
        voucher_number: voucherNumber as string,
        status: "draft" as const,
        party_id: input.party_id,
        voucher_date: input.voucher_date,
        due_date: input.due_date,
        supply_date: input.supply_date,
        currency_code: input.currency_code ?? "AED",
        exchange_rate: exchangeRate,
        subtotal: Math.round(subtotal * 10000) / 10000,
        discount_total: 0,
        tax_total: Math.round(taxTotal * 10000) / 10000,
        total_amount: Math.round(totalAmount * 10000) / 10000,
        base_subtotal: Math.round(baseSubtotal * 10000) / 10000,
        base_discount: 0,
        base_tax_total: Math.round(baseTaxTotal * 10000) / 10000,
        base_total_amount: Math.round(baseTotalAmount * 10000) / 10000,
        reference: input.reference,
        narration: input.narration,
        terms_and_conditions: input.terms_and_conditions,
        internal_notes: input.internal_notes,
        place_of_supply: input.place_of_supply,
        buyer_trn: input.buyer_trn,
        seller_trn: input.seller_trn,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (vError) return { success: false, error: vError.message };

    // 5. Insert voucher lines
    const lineInserts = computedLines.map((line) => ({
      voucher_id: voucher.id,
      entity_id: input.entity_id,
      line_number: line.line_number,
      item_id: line.item_id,
      account_id: line.account_id,
      description: line.description,
      quantity: line.quantity,
      unit_price: line.unit_price,
      discount_pct: line.discount_pct ?? 0,
      line_amount: line.line_amount,
      tax_code_id: line.tax_code_id,
      tax_rate: line.tax_rate,
      tax_amount: line.tax_amount,
      line_total: line.line_total,
      base_line_amount: line.base_line_amount,
      base_tax_amount: line.base_tax_amount,
      base_line_total: line.base_line_total,
      cost_centre_id: line.cost_centre_id,
      sort_order: line.sort_order,
      created_by: user.id,
    }));

    const { error: lError } = await supabase
      .from("voucher_lines")
      .insert(lineInserts);

    if (lError) return { success: false, error: lError.message };

    return { success: true, data: { id: voucher.id, voucher_number: voucherNumber } };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Posts a draft voucher:
 * 1. Validates the period is open
 * 2. Creates a journal entry + lines (double-entry)
 * 3. Marks the voucher as 'posted'
 *
 * The balanced-journal deferred constraint trigger ensures correctness at commit.
 */
export async function postVoucher(
  voucherId: string
): Promise<VoucherActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    // 1. Fetch the voucher and its lines
    const { data: voucher, error: vErr } = await supabase
      .from("vouchers")
      .select("*")
      .eq("id", voucherId)
      .single();

    if (vErr || !voucher) return { success: false, error: vErr?.message ?? "Voucher not found" };

    if (voucher.status !== "draft" && voucher.status !== "submitted") {
      return { success: false, error: `Cannot post voucher in '${voucher.status}' status.` };
    }

    const { data: lines, error: lErr } = await supabase
      .from("voucher_lines")
      .select("*")
      .eq("voucher_id", voucherId)
      .order("line_number");

    if (lErr) return { success: false, error: lErr.message };
    if (!lines || lines.length === 0) {
      return { success: false, error: "Voucher has no lines. Cannot post." };
    }

    // 2. Resolve the period
    if (!voucher.period_id) {
      return { success: false, error: "Voucher must be assigned to a period before posting." };
    }

    // 3. Generate journal entry number
    const { data: jeNumber, error: jeSeqErr } = await supabase.rpc(
      "generate_voucher_number",
      {
        p_entity_id: voucher.entity_id,
        p_voucher_type: "journal_voucher" as VoucherType,
      }
    );
    if (jeSeqErr) return { success: false, error: jeSeqErr.message };

    // 4. Create journal entry
    const { data: journalEntry, error: jeErr } = await supabase
      .from("journal_entries")
      .insert({
        entity_id: voucher.entity_id,
        voucher_id: voucher.id,
        entry_number: jeNumber as string,
        entry_date: voucher.voucher_date,
        period_id: voucher.period_id,
        source: "voucher" as const,
        narration: voucher.narration ?? `${voucher.voucher_type} ${voucher.voucher_number}`,
        currency_code: voucher.currency_code,
        exchange_rate: voucher.exchange_rate,
        status: "posted" as const,
        posted_at: new Date().toISOString(),
        posted_by: user.id,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (jeErr) return { success: false, error: jeErr.message };

    // 5. Create journal lines (double-entry based on voucher type)
    const journalLines = generateJournalLines(
      voucher,
      lines,
      journalEntry.id,
      user.id
    );

    const { error: jlErr } = await supabase
      .from("journal_lines")
      .insert(journalLines);

    if (jlErr) return { success: false, error: jlErr.message };

    // 6. Mark voucher as posted
    const { error: postErr } = await supabase
      .from("vouchers")
      .update({
        status: "posted" as VoucherStatus,
        posted_at: new Date().toISOString(),
        posted_by: user.id,
        period_id: voucher.period_id,
      })
      .eq("id", voucherId);

    if (postErr) return { success: false, error: postErr.message };

    return { success: true, data: { journal_entry_id: journalEntry.id } };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Reverses a posted voucher by creating a mirror journal entry
 * with opposite debit/credit and marking the original as reversed.
 */
export async function reverseVoucher(
  voucherId: string,
  reason: string
): Promise<VoucherActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    // 1. Fetch original journal entry
    const { data: originalJE, error: jeErr } = await supabase
      .from("journal_entries")
      .select("*")
      .eq("voucher_id", voucherId)
      .eq("status", "posted")
      .single();

    if (jeErr || !originalJE) {
      return { success: false, error: "No posted journal entry found for this voucher." };
    }

    // 2. Fetch original journal lines
    const { data: originalLines, error: olErr } = await supabase
      .from("journal_lines")
      .select("*")
      .eq("journal_entry_id", originalJE.id)
      .order("line_number");

    if (olErr || !originalLines) {
      return { success: false, error: olErr?.message ?? "No journal lines found." };
    }

    // 3. Generate reversal journal entry number
    const { data: revNumber } = await supabase.rpc(
      "generate_voucher_number",
      {
        p_entity_id: originalJE.entity_id,
        p_voucher_type: "journal_voucher" as VoucherType,
      }
    );

    // 4. Create reversal journal entry
    const { data: reversalJE, error: rjeErr } = await supabase
      .from("journal_entries")
      .insert({
        entity_id: originalJE.entity_id,
        voucher_id: voucherId,
        entry_number: revNumber as string,
        entry_date: new Date().toISOString().split("T")[0],
        period_id: originalJE.period_id,
        source: "reversal" as const,
        narration: `Reversal of ${originalJE.entry_number}: ${reason}`,
        currency_code: originalJE.currency_code,
        exchange_rate: originalJE.exchange_rate,
        status: "posted" as const,
        posted_at: new Date().toISOString(),
        posted_by: user.id,
        reversal_of_id: originalJE.id,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (rjeErr) return { success: false, error: rjeErr.message };

    // 5. Create reversed lines (swap debit/credit)
    const reversalLines = originalLines.map((line, idx) => ({
      journal_entry_id: reversalJE.id,
      entity_id: line.entity_id,
      line_number: idx + 1,
      account_id: line.account_id,
      party_id: line.party_id,
      description: `Reversal: ${line.description ?? ""}`,
      debit_amount: line.credit_amount,   // Swap
      credit_amount: line.debit_amount,   // Swap
      base_debit: line.base_credit,       // Swap
      base_credit: line.base_debit,       // Swap
      cost_centre_id: line.cost_centre_id,
      created_by: user.id,
    }));

    const { error: rlErr } = await supabase
      .from("journal_lines")
      .insert(reversalLines);

    if (rlErr) return { success: false, error: rlErr.message };

    // 6. Mark original JE as reversed
    await supabase
      .from("journal_entries")
      .update({
        status: "reversed" as VoucherStatus,
        reversed_by_id: reversalJE.id,
        reversal_reason: reason,
      })
      .eq("id", originalJE.id);

    // 7. Mark voucher as reversed
    const { data: reversalVoucher } = await supabase
      .from("vouchers")
      .insert({
        entity_id: originalJE.entity_id,
        voucher_type: "journal_voucher" as VoucherType,
        voucher_number: revNumber as string,
        status: "posted" as VoucherStatus,
        voucher_date: new Date().toISOString().split("T")[0],
        narration: `Reversal of ${voucherId}: ${reason}`,
        reversal_of_id: voucherId,
        created_by: user.id,
        posted_at: new Date().toISOString(),
        posted_by: user.id,
      })
      .select("id")
      .single();

    await supabase
      .from("vouchers")
      .update({
        status: "reversed" as VoucherStatus,
        reversed_by_id: reversalVoucher?.id,
        reversal_reason: reason,
      })
      .eq("id", voucherId);

    return { success: true, data: { reversal_je_id: reversalJE.id } };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Fetches paginated vouchers for the entity with optional filters.
 */
export async function getVouchers(params: {
  entity_id: string;
  voucher_type?: VoucherType;
  status?: VoucherStatus;
  from_date?: string;
  to_date?: string;
  party_id?: string;
  search?: string;
  page?: number;
  page_size?: number;
}) {
  const supabase = await createClient();
  const page = params.page ?? 1;
  const pageSize = params.page_size ?? 25;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("vouchers")
    .select("*", { count: "exact" })
    .eq("entity_id", params.entity_id)
    .order("voucher_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (params.voucher_type) {
    query = query.eq("voucher_type", params.voucher_type);
  }
  if (params.status) {
    query = query.eq("status", params.status);
  }
  if (params.from_date) {
    query = query.gte("voucher_date", params.from_date);
  }
  if (params.to_date) {
    query = query.lte("voucher_date", params.to_date);
  }
  if (params.party_id) {
    query = query.eq("party_id", params.party_id);
  }
  if (params.search) {
    query = query.or(
      `voucher_number.ilike.%${params.search}%,narration.ilike.%${params.search}%,reference.ilike.%${params.search}%`
    );
  }

  const { data, error, count } = await query;

  return { data, error: error?.message, count, page, pageSize };
}

/**
 * Deletes a draft voucher and its lines.
 */
export async function deleteVoucher(
  voucherId: string
): Promise<VoucherActionResult> {
  const supabase = await createClient();

  const { data: voucher } = await supabase
    .from("vouchers")
    .select("status")
    .eq("id", voucherId)
    .single();

  if (!voucher) return { success: false, error: "Voucher not found." };
  if (voucher.status !== "draft") {
    return { success: false, error: `Cannot delete voucher in '${voucher.status}' status.` };
  }

  const { error } = await supabase
    .from("vouchers")
    .delete()
    .eq("id", voucherId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ---------------------------------------------------------------------------
// Journal Line Generator
// ---------------------------------------------------------------------------
// Transforms voucher lines into double-entry journal lines based on type.

interface VoucherRow {
  id: string;
  entity_id: string;
  voucher_type: VoucherType;
  voucher_number: string;
  party_id: string | null;
  exchange_rate: number;
  base_total_amount: number;
  base_tax_total: number;
  base_subtotal: number;
}

interface VoucherLineRow {
  account_id: string;
  description: string | null;
  base_line_amount: number;
  base_tax_amount: number;
  base_line_total: number;
  party_id?: string | null;
  cost_centre_id: string | null;
}

function generateJournalLines(
  voucher: VoucherRow,
  lines: VoucherLineRow[],
  journalEntryId: string,
  userId: string
) {
  const jLines: Array<{
    journal_entry_id: string;
    entity_id: string;
    line_number: number;
    account_id: string;
    party_id: string | null;
    description: string | null;
    debit_amount: number;
    credit_amount: number;
    base_debit: number;
    base_credit: number;
    cost_centre_id: string | null;
    created_by: string;
  }> = [];

  let lineNum = 1;

  const isSales = voucher.voucher_type === "sales_invoice";
  const isPurchase = voucher.voucher_type === "purchase_bill";
  const isReceipt = voucher.voucher_type === "receipt_voucher";
  const isPayment = voucher.voucher_type === "payment_voucher";

  if (isSales) {
    // Sales Invoice:
    //   DR Accounts Receivable (party control a/c) = total
    //   CR Revenue accounts (per line) = line amounts
    //   CR VAT Output (per line) = tax amounts

    // Debit: Receivable (total)
    // For now, use the first line's account as placeholder for receivable
    // In production, this would come from the party's control account
    jLines.push({
      journal_entry_id: journalEntryId,
      entity_id: voucher.entity_id,
      line_number: lineNum++,
      account_id: lines[0].account_id, // TODO: Use party control account
      party_id: voucher.party_id,
      description: `A/R - ${voucher.voucher_number}`,
      debit_amount: voucher.base_total_amount / voucher.exchange_rate,
      credit_amount: 0,
      base_debit: voucher.base_total_amount,
      base_credit: 0,
      cost_centre_id: null,
      created_by: userId,
    });

    // Credit: Revenue per line
    for (const line of lines) {
      if (line.base_line_amount > 0) {
        jLines.push({
          journal_entry_id: journalEntryId,
          entity_id: voucher.entity_id,
          line_number: lineNum++,
          account_id: line.account_id,
          party_id: null,
          description: line.description,
          debit_amount: 0,
          credit_amount: line.base_line_amount / voucher.exchange_rate,
          base_debit: 0,
          base_credit: line.base_line_amount,
          cost_centre_id: line.cost_centre_id,
          created_by: userId,
        });
      }

      // Credit: VAT output per line
      if (line.base_tax_amount > 0) {
        jLines.push({
          journal_entry_id: journalEntryId,
          entity_id: voucher.entity_id,
          line_number: lineNum++,
          account_id: line.account_id, // TODO: Use VAT output account
          party_id: null,
          description: `VAT - ${line.description ?? ""}`,
          debit_amount: 0,
          credit_amount: line.base_tax_amount / voucher.exchange_rate,
          base_debit: 0,
          base_credit: line.base_tax_amount,
          cost_centre_id: null,
          created_by: userId,
        });
      }
    }
  } else if (isPurchase) {
    // Purchase Bill: Mirror of sales
    //   DR Expense/Asset accounts (per line)
    //   DR VAT Input (per line)
    //   CR Accounts Payable (total)

    for (const line of lines) {
      if (line.base_line_amount > 0) {
        jLines.push({
          journal_entry_id: journalEntryId,
          entity_id: voucher.entity_id,
          line_number: lineNum++,
          account_id: line.account_id,
          party_id: null,
          description: line.description,
          debit_amount: line.base_line_amount / voucher.exchange_rate,
          credit_amount: 0,
          base_debit: line.base_line_amount,
          base_credit: 0,
          cost_centre_id: line.cost_centre_id,
          created_by: userId,
        });
      }

      if (line.base_tax_amount > 0) {
        jLines.push({
          journal_entry_id: journalEntryId,
          entity_id: voucher.entity_id,
          line_number: lineNum++,
          account_id: line.account_id, // TODO: Use VAT input account
          party_id: null,
          description: `VAT - ${line.description ?? ""}`,
          debit_amount: line.base_tax_amount / voucher.exchange_rate,
          credit_amount: 0,
          base_debit: line.base_tax_amount,
          base_credit: 0,
          cost_centre_id: null,
          created_by: userId,
        });
      }
    }

    // Credit: Payable
    jLines.push({
      journal_entry_id: journalEntryId,
      entity_id: voucher.entity_id,
      line_number: lineNum++,
      account_id: lines[0].account_id, // TODO: Use party control account
      party_id: voucher.party_id,
      description: `A/P - ${voucher.voucher_number}`,
      debit_amount: 0,
      credit_amount: voucher.base_total_amount / voucher.exchange_rate,
      base_debit: 0,
      base_credit: voucher.base_total_amount,
      cost_centre_id: null,
      created_by: userId,
    });
  } else if (isReceipt || isPayment) {
    // Simple cash/bank entry — lines determine accounts
    for (const line of lines) {
      jLines.push({
        journal_entry_id: journalEntryId,
        entity_id: voucher.entity_id,
        line_number: lineNum++,
        account_id: line.account_id,
        party_id: voucher.party_id,
        description: line.description,
        debit_amount: isReceipt ? line.base_line_total / voucher.exchange_rate : 0,
        credit_amount: isPayment ? line.base_line_total / voucher.exchange_rate : 0,
        base_debit: isReceipt ? line.base_line_total : 0,
        base_credit: isPayment ? line.base_line_total : 0,
        cost_centre_id: line.cost_centre_id,
        created_by: userId,
      });
    }
  } else {
    // Journal Voucher / others — lines already represent debits/credits
    for (const line of lines) {
      jLines.push({
        journal_entry_id: journalEntryId,
        entity_id: voucher.entity_id,
        line_number: lineNum++,
        account_id: line.account_id,
        party_id: voucher.party_id,
        description: line.description,
        debit_amount: line.base_line_amount / voucher.exchange_rate,
        credit_amount: 0,
        base_debit: line.base_line_amount,
        base_credit: 0,
        cost_centre_id: line.cost_centre_id,
        created_by: userId,
      });
    }
  }

  return jLines;
}
