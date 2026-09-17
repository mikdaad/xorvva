"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { itemSchema, inlineItemSchema, type ItemInput, type InlineItemInput } from "@/lib/validations/masters";
import type { ItemOption } from "@/lib/vouchers/entry-options";

export interface ItemActionResult {
  success: boolean;
  itemId?: string;
  error?: string;
}

export interface InlineItemResult {
  success: boolean;
  error?: string;
  /** Full option row so the grid row can be populated without refetching. */
  item?: ItemOption;
  itemId?: string;
}

/** Derives a stable, readable code from a name: "Steel Pipe 40mm" -> "STEEL-PIPE-40MM". */
function deriveItemCode(name: string): string {
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return slug || "ITEM";
}

/**
 * Creates the minimum viable item from inside the voucher grid.
 *
 * `items.code` is NOT NULL and unique per entity, but asking for a code
 * mid-entry is exactly the interruption this feature removes — so a code is
 * derived from the name and suffixed until it is free.
 */
export async function createItemInline(
  input: InlineItemInput
): Promise<InlineItemResult> {
  try {
    const validated = inlineItemSchema.parse(input);
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "Authentication required." };

    // Every referenced ledger and tax code must belong to the active entity.
    const accountIds = [validated.sales_account_id, validated.purchase_account_id].filter(
      (id): id is string => Boolean(id)
    );

    if (accountIds.length > 0) {
      const { data: accounts } = await supabase
        .from("accounts")
        .select("id")
        .eq("entity_id", validated.entity_id)
        .eq("is_group", false)
        .in("id", accountIds);

      if ((accounts?.length ?? 0) !== accountIds.length) {
        return { success: false, error: "Select postable ledgers from this company." };
      }
    }

    if (validated.tax_code_id) {
      const { data: taxCode } = await supabase
        .from("tax_codes")
        .select("id")
        .eq("id", validated.tax_code_id)
        .eq("entity_id", validated.entity_id)
        .maybeSingle();

      if (!taxCode) {
        return { success: false, error: "Select a tax code from this company." };
      }
    }

    const baseCode = validated.code?.trim() || deriveItemCode(validated.name);

    // Find codes already taken on this base so the suffix skips them in one
    // round trip instead of retrying the insert on each collision.
    const { data: clashes } = await supabase
      .from("items")
      .select("code")
      .eq("entity_id", validated.entity_id)
      .ilike("code", `${baseCode}%`);

    const taken = new Set((clashes ?? []).map((row) => String(row.code).toUpperCase()));
    let code = baseCode;
    for (let suffix = 2; taken.has(code.toUpperCase()); suffix += 1) {
      code = `${baseCode}-${suffix}`;
    }

    const { data, error } = await supabase
      .from("items")
      .insert({
        entity_id: validated.entity_id,
        item_type: validated.item_type,
        code,
        name: validated.name,
        unit_of_measure: validated.unit_of_measure,
        sales_account_id: validated.sales_account_id || null,
        purchase_account_id: validated.purchase_account_id || null,
        tax_code_id: validated.tax_code_id || null,
        default_price: validated.default_price ?? null,
        is_active: true,
        created_by: user.id,
      })
      .select(
        "id, name, code, item_type, unit_of_measure, sales_account_id, purchase_account_id, tax_code_id, default_price"
      )
      .single();

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: `An item named "${validated.name}" already exists.` };
      }
      return { success: false, error: error.message };
    }

    revalidatePath("/masters/items");

    return { success: true, item: data as ItemOption, itemId: data.id };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: err.issues.map((i) => i.message).join(". ") };
    }
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getItems(entityId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("items")
    .select(
      `id, entity_id, item_type, code, name, name_ar, description, unit_of_measure,
       purchase_account_id, sales_account_id, tax_code_id, default_price, hsn_code,
       is_active, created_at`
    )
    .eq("entity_id", entityId)
    .order("name");

  if (error) {
    console.error("Error fetching items:", error);
    return [];
  }

  return data ?? [];
}

export async function createItem(input: ItemInput): Promise<ItemActionResult> {
  try {
    const validated = itemSchema.parse(input);
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "Authentication required." };

    const { data, error } = await supabase
      .from("items")
      .insert({
        entity_id: validated.entity_id,
        item_type: validated.item_type,
        code: validated.code,
        name: validated.name,
        name_ar: validated.name_ar || null,
        description: validated.description || null,
        unit_of_measure: validated.unit_of_measure || null,
        purchase_account_id: validated.purchase_account_id || null,
        sales_account_id: validated.sales_account_id || null,
        tax_code_id: validated.tax_code_id || null,
        default_price: validated.default_price ?? null,
        hsn_code: validated.hsn_code || null,
        is_active: true,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: `An item with code "${validated.code}" already exists.` };
      }
      return { success: false, error: error.message };
    }

    revalidatePath("/masters/items");
    return { success: true, itemId: data.id };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: err.issues.map((i) => i.message).join(". ") };
    }
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateItem(
  itemId: string,
  input: ItemInput
): Promise<ItemActionResult> {
  try {
    const validated = itemSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("items")
      .update({
        item_type: validated.item_type,
        code: validated.code,
        name: validated.name,
        name_ar: validated.name_ar || null,
        description: validated.description || null,
        unit_of_measure: validated.unit_of_measure || null,
        purchase_account_id: validated.purchase_account_id || null,
        sales_account_id: validated.sales_account_id || null,
        tax_code_id: validated.tax_code_id || null,
        default_price: validated.default_price ?? null,
        hsn_code: validated.hsn_code || null,
      })
      .eq("id", itemId);

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: `An item with code "${validated.code}" already exists.` };
      }
      return { success: false, error: error.message };
    }

    revalidatePath("/masters/items");
    return { success: true, itemId };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: err.issues.map((i) => i.message).join(". ") };
    }
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function toggleItemStatus(
  itemId: string,
  isActive: boolean
): Promise<ItemActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("items").update({ is_active: isActive }).eq("id", itemId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/masters/items");
  return { success: true, itemId };
}

export async function deleteItem(itemId: string): Promise<ItemActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("items").delete().eq("id", itemId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/masters/items");
  return { success: true, itemId };
}
