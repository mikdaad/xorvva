"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { taxCodeSchema, type TaxCodeInput } from "@/lib/validations/masters";

export interface TaxCodeActionResult {
  success: boolean;
  taxCodeId?: string;
  error?: string;
}

export async function getTaxCodes(entityId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tax_codes")
    .select(
      `id, entity_id, code, name, rate, tax_scope, fta_code, account_id,
       output_account_id, input_account_id, is_default, is_active, created_at`
    )
    .eq("entity_id", entityId)
    .order("code");

  if (error) {
    console.error("Error fetching tax codes:", error);
    return [];
  }

  return data ?? [];
}

export async function createTaxCode(input: TaxCodeInput): Promise<TaxCodeActionResult> {
  try {
    const validated = taxCodeSchema.parse(input);
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "Authentication required." };

    if (validated.is_default) {
      await supabase
        .from("tax_codes")
        .update({ is_default: false })
        .eq("entity_id", validated.entity_id);
    }

    const { data, error } = await supabase
      .from("tax_codes")
      .insert({
        entity_id: validated.entity_id,
        code: validated.code,
        name: validated.name,
        rate: validated.rate,
        tax_scope: validated.tax_scope,
        fta_code: validated.fta_code || null,
        account_id: validated.account_id || null,
        output_account_id: validated.output_account_id || null,
        input_account_id: validated.input_account_id || null,
        is_default: validated.is_default,
        is_active: true,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: `A tax code "${validated.code}" already exists.` };
      }
      return { success: false, error: error.message };
    }

    revalidatePath("/masters/tax-codes");
    return { success: true, taxCodeId: data.id };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: err.issues.map((i) => i.message).join(". ") };
    }
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateTaxCode(
  taxCodeId: string,
  input: TaxCodeInput
): Promise<TaxCodeActionResult> {
  try {
    const validated = taxCodeSchema.parse(input);
    const supabase = await createClient();

    if (validated.is_default) {
      await supabase
        .from("tax_codes")
        .update({ is_default: false })
        .eq("entity_id", validated.entity_id);
    }

    const { error } = await supabase
      .from("tax_codes")
      .update({
        code: validated.code,
        name: validated.name,
        rate: validated.rate,
        tax_scope: validated.tax_scope,
        fta_code: validated.fta_code || null,
        account_id: validated.account_id || null,
        output_account_id: validated.output_account_id || null,
        input_account_id: validated.input_account_id || null,
        is_default: validated.is_default,
      })
      .eq("id", taxCodeId);

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: `A tax code "${validated.code}" already exists.` };
      }
      return { success: false, error: error.message };
    }

    revalidatePath("/masters/tax-codes");
    return { success: true, taxCodeId };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: err.issues.map((i) => i.message).join(". ") };
    }
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function toggleTaxCodeStatus(
  taxCodeId: string,
  isActive: boolean
): Promise<TaxCodeActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("tax_codes").update({ is_active: isActive }).eq("id", taxCodeId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/masters/tax-codes");
  return { success: true, taxCodeId };
}

export async function deleteTaxCode(taxCodeId: string): Promise<TaxCodeActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("tax_codes").delete().eq("id", taxCodeId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/masters/tax-codes");
  return { success: true, taxCodeId };
}
