"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getVoucherConfig } from "@/lib/vouchers/voucher-types";
import { postVoucherAtomic } from "@/lib/actions/posting";
import type { VoucherType } from "@/types/database.types";

/**
 * Entry-screen line as submitted by the client.
 *
 * For journal/contra vouchers the accountant states the side explicitly via
 * `dr_cr` and `amount`. For invoices the amount is derived from
 * quantity × rate less discount, with tax applied from the tax code.
 */
export interface EntryLine {
  account_id: string;
  /** Stock/service item on invoice lines; null on journal and settlement lines. */
  item_id: string | null;
  description: string | null;
  dr_cr: "dr" | "cr";
  amount: number;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  tax_code_id: string | null;
}

export interface SaveVoucherInput {
  voucher_id?: string;
  entity_id: string;
  voucher_type: VoucherType;
  voucher_date: string;
  party_id: string | null;
  reference: string | null;
  narration: string | null;
  buyer_trn?: string | null;
  seller_trn: string | null;
  lines: EntryLine[];
}

export interface SaveVoucherResult {
  success: boolean;
  voucherId?: string;
  voucherNumber?: string;
  journalEntryId?: string;
  error?: string;
}

function money(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Creates a voucher and posts it in one user action ("Save & Post").
 *
 * The voucher and its lines are written first, then `postVoucherAtomic`
 * generates the double entry and commits it inside a single database
 * transaction. If posting fails, the draft voucher is deleted so a failed
 * attempt does not leave an unposted stub behind — vouchers are only immutable
 * once posted, so removing a draft is safe.
 */
export async function saveAndPostVoucher(
  input: SaveVoucherInput
): Promise<SaveVoucherResult> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "Not authenticated." };

    const config = getVoucherConfig(input.voucher_type);
    if (!config) {
      return { success: false, error: `Unsupported voucher type '${input.voucher_type}'.` };
    }

    const activeLines = input.lines.filter((l) => l.account_id);
    if (activeLines.length === 0) {
      return { success: false, error: "Add at least one ledger line." };
    }

    if (config.requiresParty && !input.party_id) {
      return {
        success: false,
        error: `Select a ${config.direction === "outward" ? "customer" : "supplier"}.`,
      };
    }

    const isInvoice = config.mode === "invoice";

    // Items are validated against the entity so a tampered payload cannot
    // attach another tenant's item to this voucher.
    const itemIds = [...new Set(activeLines.map((l) => l.item_id).filter(Boolean))] as string[];

    if (itemIds.length > 0) {
      const { data: validItems } = await supabase
        .from("items")
        .select("id")
        .eq("entity_id", input.entity_id)
        .in("id", itemIds);

      if ((validItems?.length ?? 0) !== itemIds.length) {
        return { success: false, error: "One or more items do not belong to this company." };
      }
    }

    // Tax rates come from the database rather than the client, so a tampered
    // payload cannot understate VAT.
    const taxCodeIds = [...new Set(activeLines.map((l) => l.tax_code_id).filter(Boolean))] as string[];
    const rateByTaxCode = new Map<string, number>();

    if (taxCodeIds.length > 0) {
      const { data: taxCodes } = await supabase
        .from("tax_codes")
        .select("id, rate")
        .eq("entity_id", input.entity_id)
        .in("id", taxCodeIds);

      for (const tc of taxCodes ?? []) {
        rateByTaxCode.set(tc.id as string, Number(tc.rate));
      }
    }

    // Compute each line, then the voucher totals.
    const computed = activeLines.map((line, index) => {
      const taxRate = line.tax_code_id ? rateByTaxCode.get(line.tax_code_id) ?? 0 : 0;

      if (isInvoice) {
        const gross = line.quantity * line.unit_price;
        const net = money(gross * (1 - line.discount_pct / 100));
        const tax = money(net * (taxRate / 100));

        return {
          line_number: index + 1,
          account_id: line.account_id,
          item_id: line.item_id,
          description: line.description,
          quantity: line.quantity,
          unit_price: line.unit_price,
          discount_pct: line.discount_pct,
          tax_code_id: line.tax_code_id,
          tax_rate: taxRate,
          line_amount: net,
          tax_amount: tax,
          line_total: money(net + tax),
          // Signed base amount: the posting layer reads the sign as Dr/Cr for
          // journal and contra vouchers, and ignores it for invoices.
          base_line_amount: net,
          base_tax_amount: tax,
          base_line_total: money(net + tax),
        };
      }

      const signed = line.dr_cr === "dr" ? Math.abs(line.amount) : -Math.abs(line.amount);

      return {
        line_number: index + 1,
        account_id: line.account_id,
        // Items only carry meaning on invoice lines.
        item_id: null as string | null,
        description: line.description,
        quantity: 1,
        unit_price: Math.abs(line.amount),
        discount_pct: 0,
        tax_code_id: null,
        tax_rate: 0,
        line_amount: Math.abs(line.amount),
        tax_amount: 0,
        line_total: Math.abs(line.amount),
        base_line_amount: money(signed),
        base_tax_amount: 0,
        base_line_total: money(signed),
      };
    });

    // Balance check for the Dr/Cr modes, before anything is written.
    if (!isInvoice) {
      const debit = computed
        .filter((l) => l.base_line_amount > 0)
        .reduce((s, l) => s + l.base_line_amount, 0);
      const credit = computed
        .filter((l) => l.base_line_amount < 0)
        .reduce((s, l) => s + Math.abs(l.base_line_amount), 0);

      if (money(debit) !== money(credit)) {
        return {
          success: false,
          error: `Entry is not balanced — debits ${money(debit).toFixed(2)} vs credits ${money(credit).toFixed(2)}.`,
        };
      }
      if (money(debit) === 0) {
        return { success: false, error: "Voucher total cannot be zero." };
      }
    }

    const subtotal = isInvoice
      ? money(computed.reduce((s, l) => s + l.line_amount, 0))
      : money(computed.filter((l) => l.base_line_amount > 0).reduce((s, l) => s + l.line_amount, 0));
    const taxTotal = money(computed.reduce((s, l) => s + l.tax_amount, 0));
    const grandTotal = money(subtotal + taxTotal);

    if (grandTotal <= 0) {
      return { success: false, error: "Voucher total must be greater than zero." };
    }

    let voucherNumber = "";
    let voucherId = input.voucher_id;

    if (voucherId) {
      // Update existing draft voucher
      const { data: existingVoucher, error: getErr } = await supabase
        .from("vouchers")
        .select("voucher_number, status")
        .eq("id", voucherId)
        .single();
      
      if (getErr || !existingVoucher) {
        return { success: false, error: "Draft voucher not found." };
      }
      if (existingVoucher.status !== "draft") {
        return { success: false, error: `Cannot modify voucher in '${existingVoucher.status}' status.` };
      }
      voucherNumber = existingVoucher.voucher_number;

      const { error: updErr } = await supabase
        .from("vouchers")
        .update({
          voucher_type: input.voucher_type,
          party_id: input.party_id,
          voucher_date: input.voucher_date,
          subtotal,
          tax_total: taxTotal,
          total_amount: grandTotal,
          base_subtotal: subtotal,
          base_tax_total: taxTotal,
          base_total_amount: grandTotal,
          reference: input.reference,
          narration: input.narration,
          buyer_trn: input.buyer_trn ?? null,
          seller_trn: input.seller_trn,
        })
        .eq("id", voucherId);

      if (updErr) return { success: false, error: updErr.message };

      // Clear existing lines to replace them
      await supabase.from("voucher_lines").delete().eq("voucher_id", voucherId);

    } else {
      // Create new voucher
      const { data: generatedNumber, error: numErr } = await supabase.rpc("generate_voucher_number", {
        p_entity_id: input.entity_id,
        p_voucher_type: input.voucher_type,
      });

      if (numErr) return { success: false, error: numErr.message };
      voucherNumber = generatedNumber as string;

      const { data: newVoucher, error: vErr } = await supabase
        .from("vouchers")
        .insert({
          entity_id: input.entity_id,
          voucher_type: input.voucher_type,
          voucher_number: voucherNumber,
          status: "draft" as const,
          party_id: input.party_id,
          voucher_date: input.voucher_date,
          currency_code: "AED",
          exchange_rate: 1,
          subtotal,
          discount_total: 0,
          tax_total: taxTotal,
          total_amount: grandTotal,
          base_subtotal: subtotal,
          base_discount: 0,
          base_tax_total: taxTotal,
          base_total_amount: grandTotal,
          reference: input.reference,
          narration: input.narration,
          buyer_trn: input.buyer_trn ?? null,
          seller_trn: input.seller_trn,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (vErr || !newVoucher) {
        return { success: false, error: vErr?.message ?? "Could not create the voucher." };
      }
      voucherId = newVoucher.id;
    }

    const { error: linesErr } = await supabase.from("voucher_lines").insert(
      computed.map((line) => ({
        voucher_id: voucherId,
        entity_id: input.entity_id,
        line_number: line.line_number,
        account_id: line.account_id,
        item_id: line.item_id,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
        discount_pct: line.discount_pct,
        line_amount: line.line_amount,
        tax_code_id: line.tax_code_id,
        tax_rate: line.tax_rate,
        tax_amount: line.tax_amount,
        line_total: line.line_total,
        base_line_amount: line.base_line_amount,
        base_tax_amount: line.base_tax_amount,
        base_line_total: line.base_line_total,
        sort_order: line.line_number,
        created_by: user.id,
      }))
    );

    if (linesErr) {
      await supabase.from("vouchers").delete().eq("id", voucherId);
      return { success: false, error: linesErr.message };
    }

    const posted = await postVoucherAtomic(voucherId!);

    if (!posted.success) {
      // If we created a new voucher (no input.voucher_id), roll it back.
      // If we updated an existing draft, we leave it as draft.
      if (!input.voucher_id) {
        await supabase.from("vouchers").delete().eq("id", voucherId);
      }
      return { success: false, error: posted.error };
    }

    revalidatePath("/transactions");
    revalidatePath("/dashboard");

    return {
      success: true,
      voucherId: voucherId,
      voucherNumber: voucherNumber as string,
      journalEntryId: posted.journalEntryId,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
