import { redirect } from "next/navigation";
import { requireActiveEntity } from "@/lib/entity-context";
import { createClient } from "@/lib/supabase/server";
import { isEntryVoucherType } from "@/lib/vouchers/voucher-types";
import type { VoucherType } from "@/types/database.types";
import { VoucherEntryClient, type InitialDraft } from "./voucher-entry-client";

export const metadata = {
  title: "Voucher Entry | TrueLedge",
};

/**
 * Unified keyboard-first voucher entry — Tally's F4–F9 vouchers on one screen.
 *
 * `?type=` preselects a voucher type, which is how the legacy
 * /transactions/sales-invoice and /transactions/purchase-bill routes redirect
 * into this screen.
 */
export default async function NewVoucherPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; draftId?: string }>;
}) {
  const entityId = await requireActiveEntity();

  if (!entityId) {
    redirect("/entities");
  }

  const params = await searchParams;
  const supabase = await createClient();

  let initialType: VoucherType =
    params.type && isEntryVoucherType(params.type)
      ? (params.type as VoucherType)
      : "payment_voucher";
  
  let initialDraft: InitialDraft | undefined;
  if (params.draftId) {
    const { data: voucher } = await supabase
      .from("vouchers")
      .select(`
        id, voucher_type, voucher_date, party_id, reference, narration, status,
        voucher_lines (
          account_id, item_id, description, quantity, unit_price, discount_pct, tax_code_id, base_line_amount
        )
      `)
      .eq("id", params.draftId)
      .eq("entity_id", entityId)
      .single();

    const voucherAny = voucher as any;
    if (voucherAny && voucherAny.status === "draft") {
      initialType = voucherAny.voucher_type as VoucherType;
      initialDraft = {
        id: voucherAny.id,
        voucherDate: voucherAny.voucher_date,
        partyId: voucherAny.party_id,
        reference: voucherAny.reference || "",
        narration: voucherAny.narration || "",
        lines: (voucherAny.voucher_lines || []).map((l: any) => ({
          account_id: l.account_id,
          item_id: l.item_id,
          description: l.description || "",
          dr_cr: l.base_line_amount >= 0 ? "dr" : "cr",
          amount: Math.abs(l.base_line_amount).toString(),
          quantity: l.quantity.toString(),
          unit_price: l.unit_price.toString(),
          discount_pct: l.discount_pct.toString(),
          tax_code_id: l.tax_code_id || "",
        })),
      };
    }
  }

  const [
    entityResult,
    accountsResult,
    partiesResult,
    taxCodesResult,
    itemsResult,
  ] = await Promise.all([
    supabase
      .from("entities")
      .select("trade_name, base_currency, decimal_places, trn")
      .eq("id", entityId)
      .maybeSingle(),
    // Only postable ledgers — groups cannot receive entries.
    supabase
      .from("accounts")
      .select("id, name, code, account_type, is_bank, parent_id")
      .eq("entity_id", entityId)
      .eq("is_group", false)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("parties")
      .select("id, name, party_type, trn, control_account_id")
      .eq("entity_id", entityId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("tax_codes")
      .select("id, code, name, rate")
      .eq("entity_id", entityId)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("items")
      .select(
        "id, name, code, item_type, unit_of_measure, sales_account_id, purchase_account_id, tax_code_id, default_price"
      )
      .eq("entity_id", entityId)
      .eq("is_active", true)
      .order("name"),
  ]);

  const entity = entityResult.data;

  return (
    <VoucherEntryClient
      entityId={entityId}
      entityName={entity?.trade_name ?? "Company"}
      baseCurrency={entity?.base_currency ?? "AED"}
      sellerTrn={entity?.trn ?? null}
      initialType={initialType}
      initialDraft={initialDraft}
      accounts={accountsResult.data ?? []}
      parties={partiesResult.data ?? []}
      taxCodes={taxCodesResult.data ?? []}
      items={itemsResult.data ?? []}
    />
  );
}
