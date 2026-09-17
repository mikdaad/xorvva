"use server";

import { createClient } from "@/lib/supabase/server";
import { getVoucherConfig } from "@/lib/vouchers/voucher-types";
import type { VoucherType } from "@/types/database.types";

/**
 * Double-entry generation and atomic posting.
 *
 * This module replaces the placeholder logic that previously lived in
 * `generateJournalLines`, which posted sales invoices by debiting
 * `lines[0].account_id` — the revenue account — instead of receivables, and
 * credited VAT to that same revenue account. The result balanced (debits
 * equalled credits) while being accounting nonsense: receivables never moved
 * and the VAT liability was never recognised.
 *
 * Accounts are now resolved explicitly:
 *   - receivable/payable  from the party's `control_account_id`
 *   - output/input VAT    from the tax code's directional account
 * and posting fails loudly when a required account cannot be resolved, rather
 * than silently writing a self-cancelling entry.
 */

export interface PostingLine {
  account_id: string;
  party_id: string | null;
  description: string | null;
  debit: number;
  credit: number;
  base_debit: number;
  base_credit: number;
  cost_centre_id: string | null;
}

export interface PostVoucherResult {
  success: boolean;
  journalEntryId?: string;
  error?: string;
}

interface VoucherRecord {
  id: string;
  entity_id: string;
  voucher_type: VoucherType;
  voucher_number: string;
  party_id: string | null;
  status: string;
  exchange_rate: number;
  base_total_amount: number;
  narration: string | null;
}

interface VoucherLineRecord {
  account_id: string;
  description: string | null;
  tax_code_id: string | null;
  base_line_amount: number;
  base_tax_amount: number;
  base_line_total: number;
  cost_centre_id: string | null;
}

/** Rounds to 4dp — the scale of every NUMERIC(19,4) amount column. */
function money(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Builds the balanced set of journal lines for a voucher.
 *
 * Exported for testing and for the client-side preview, so the figures an
 * accountant sees before saving are produced by the same code that posts.
 */
export async function buildPostingLines(
  voucher: VoucherRecord,
  lines: VoucherLineRecord[]
): Promise<{ lines: PostingLine[]; error?: string }> {
  const config = getVoucherConfig(voucher.voucher_type);

  if (!config) {
    return { lines: [], error: `Unsupported voucher type '${voucher.voucher_type}'.` };
  }

  const supabase = await createClient();
  const rate = voucher.exchange_rate || 1;
  const out: PostingLine[] = [];

  // -- Journal & contra: the grid already states both sides -------------------
  if (config.mode === "journal" || config.mode === "settlement") {
    for (const line of lines) {
      // For these modes the caller encodes direction in the sign of
      // base_line_amount: positive = debit, negative = credit.
      const amount = line.base_line_amount;
      if (amount === 0) continue;

      const isDebit = amount > 0;
      const abs = Math.abs(amount);

      out.push({
        account_id: line.account_id,
        party_id: voucher.party_id,
        description: line.description,
        debit: isDebit ? money(abs / rate) : 0,
        credit: isDebit ? 0 : money(abs / rate),
        base_debit: isDebit ? money(abs) : 0,
        base_credit: isDebit ? 0 : money(abs),
        cost_centre_id: line.cost_centre_id,
      });
    }

    const totalDebit = out.reduce((s, l) => s + l.base_debit, 0);
    const totalCredit = out.reduce((s, l) => s + l.base_credit, 0);

    if (money(totalDebit) !== money(totalCredit)) {
      return {
        lines: [],
        error: `Entry is not balanced: debits ${money(totalDebit)} vs credits ${money(totalCredit)}.`,
      };
    }

    return { lines: out };
  }

  // -- Invoice: resolve the party control account and VAT accounts -----------
  const isOutward = config.direction === "outward";

  if (!voucher.party_id) {
    return {
      lines: [],
      error: `A ${config.label.toLowerCase()} voucher requires a ${
        isOutward ? "customer" : "supplier"
      }.`,
    };
  }

  const { data: party } = await supabase
    .from("parties")
    .select("id, name, control_account_id")
    .eq("id", voucher.party_id)
    .maybeSingle();

  if (!party) {
    return { lines: [], error: "Party not found." };
  }

  // Fall back to the seeded control ledger when the party has no explicit one,
  // so a newly created customer still posts to receivables rather than failing.
  let controlAccountId = party.control_account_id as string | null;

  if (!controlAccountId) {
    const fallbackName = isOutward ? "Accounts Receivable" : "Accounts Payable";
    const { data: fallback } = await supabase
      .from("accounts")
      .select("id")
      .eq("entity_id", voucher.entity_id)
      .eq("name", fallbackName)
      .maybeSingle();

    controlAccountId = (fallback?.id as string | undefined) ?? null;
  }

  if (!controlAccountId) {
    return {
      lines: [],
      error: `No ${
        isOutward ? "receivable" : "payable"
      } control account is set for "${party.name}", and the default ledger is missing. Set one on the party master before posting.`,
    };
  }

  // Resolve VAT accounts for every tax code used on the voucher, in one query.
  const taxCodeIds = [...new Set(lines.map((l) => l.tax_code_id).filter(Boolean))] as string[];

  const taxAccountByCode = new Map<string, string | null>();

  if (taxCodeIds.length > 0) {
    const { data: taxCodes } = await supabase
      .from("tax_codes")
      .select("id, code, name, output_account_id, input_account_id, account_id")
      .in("id", taxCodeIds);

    for (const tc of taxCodes ?? []) {
      const directional = isOutward
        ? (tc.output_account_id as string | null)
        : (tc.input_account_id as string | null);
      taxAccountByCode.set(tc.id as string, directional ?? (tc.account_id as string | null));
    }
  }

  let runningTotal = 0;

  for (const line of lines) {
    // Income (sales) is credited; expense/asset (purchases) is debited.
    if (line.base_line_amount !== 0) {
      out.push({
        account_id: line.account_id,
        party_id: null,
        description: line.description,
        debit: isOutward ? 0 : money(line.base_line_amount / rate),
        credit: isOutward ? money(line.base_line_amount / rate) : 0,
        base_debit: isOutward ? 0 : money(line.base_line_amount),
        base_credit: isOutward ? money(line.base_line_amount) : 0,
        cost_centre_id: line.cost_centre_id,
      });
      runningTotal += line.base_line_amount;
    }

    if (line.base_tax_amount !== 0) {
      const vatAccountId = line.tax_code_id ? taxAccountByCode.get(line.tax_code_id) : null;

      if (!vatAccountId) {
        return {
          lines: [],
          error:
            "A tax code on this voucher has no VAT account configured. Link the tax code to its VAT Output/Input ledger before posting.",
        };
      }

      out.push({
        account_id: vatAccountId,
        party_id: null,
        description: `VAT — ${line.description ?? "line"}`,
        debit: isOutward ? 0 : money(line.base_tax_amount / rate),
        credit: isOutward ? money(line.base_tax_amount / rate) : 0,
        base_debit: isOutward ? 0 : money(line.base_tax_amount),
        base_credit: isOutward ? money(line.base_tax_amount) : 0,
        cost_centre_id: null,
      });
      runningTotal += line.base_tax_amount;
    }
  }

  if (runningTotal === 0) {
    return { lines: [], error: "Voucher total is zero — nothing to post." };
  }

  // The balancing side: what the customer owes us, or what we owe the supplier.
  out.push({
    account_id: controlAccountId,
    party_id: voucher.party_id,
    description: `${isOutward ? "Receivable" : "Payable"} — ${voucher.voucher_number}`,
    debit: isOutward ? money(runningTotal / rate) : 0,
    credit: isOutward ? 0 : money(runningTotal / rate),
    base_debit: isOutward ? money(runningTotal) : 0,
    base_credit: isOutward ? 0 : money(runningTotal),
    cost_centre_id: null,
  });

  return { lines: out };
}

/**
 * Posts a voucher through the `post_voucher_atomic` RPC.
 *
 * All ledger writes happen inside one database transaction, so a failure at any
 * point leaves the voucher untouched in draft rather than stranding a
 * half-written immutable journal entry.
 */
export async function postVoucherAtomic(voucherId: string): Promise<PostVoucherResult> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "Not authenticated." };

    const { data: voucher, error: vErr } = await supabase
      .from("vouchers")
      .select(
        "id, entity_id, voucher_type, voucher_number, party_id, status, exchange_rate, base_total_amount, narration"
      )
      .eq("id", voucherId)
      .maybeSingle();

    if (vErr || !voucher) {
      return { success: false, error: vErr?.message ?? "Voucher not found." };
    }

    const { data: lines, error: lErr } = await supabase
      .from("voucher_lines")
      .select(
        "account_id, description, tax_code_id, base_line_amount, base_tax_amount, base_line_total, cost_centre_id"
      )
      .eq("voucher_id", voucherId)
      .order("line_number");

    if (lErr) return { success: false, error: lErr.message };
    if (!lines?.length) return { success: false, error: "Voucher has no lines." };

    const built = await buildPostingLines(
      voucher as unknown as VoucherRecord,
      lines as unknown as VoucherLineRecord[]
    );

    if (built.error) return { success: false, error: built.error };

    const { data: entryId, error: postErr } = await supabase.rpc("post_voucher_atomic", {
      p_voucher_id: voucherId,
      p_lines: built.lines,
    });

    if (postErr) return { success: false, error: postErr.message };

    return { success: true, journalEntryId: entryId as string };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
