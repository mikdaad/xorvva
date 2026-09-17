"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { partySchema, inlinePartySchema, type PartyInput, type InlinePartyInput } from "@/lib/validations/masters";
import type { PartyOption } from "@/lib/vouchers/entry-options";

export interface PartyActionResult {
  success: boolean;
  partyId?: string;
  error?: string;
}

export interface InlinePartyResult {
  success: boolean;
  error?: string;
  /** Full option row so the caller can select it without refetching. */
  party?: PartyOption;
  partyId?: string;
  /** The party's default ledger, ready to auto-fill the voucher line. */
  defaultAccountId?: string | null;
}

/**
 * Creates the minimum viable party from inside the voucher screen.
 *
 * Returns the whole option row rather than just an id so the combobox can
 * select the new party immediately; `revalidatePath` refreshes the master list
 * in the background for the next render.
 */
export async function createPartyInline(
  input: InlinePartyInput
): Promise<InlinePartyResult> {
  try {
    const validated = inlinePartySchema.parse(input);
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "Authentication required." };

    // The chosen ledger must belong to the active entity and be postable. RLS
    // already scopes writes to the tenant, but this stops a tampered payload
    // pointing the new party at another entity's ledger, or at a group header.
    const { data: account } = await supabase
      .from("accounts")
      .select("id")
      .eq("id", validated.control_account_id)
      .eq("entity_id", validated.entity_id)
      .eq("is_group", false)
      .maybeSingle();

    if (!account) {
      return { success: false, error: "Select a postable ledger from this company." };
    }

    const trn = validated.trn?.trim() || null;

    const { data, error } = await supabase
      .from("parties")
      .insert({
        entity_id: validated.entity_id,
        party_type: validated.party_type,
        name: validated.name,
        trn,
        // A party that gave a TRN is VAT registered; without one the safe
        // assumption is an unregistered consumer.
        tax_treatment: trn ? ("registered" as const) : ("unregistered" as const),
        control_account_id: validated.control_account_id,
        country: "AE",
        is_active: true,
        created_by: user.id,
      })
      .select("id, name, party_type, trn, control_account_id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: `A party named "${validated.name}" already exists.` };
      }
      return { success: false, error: error.message };
    }

    revalidatePath("/masters/parties");

    return {
      success: true,
      party: data as PartyOption,
      partyId: data.id,
      defaultAccountId: data.control_account_id,
    };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: err.issues.map((i) => i.message).join(". ") };
    }
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getParties(entityId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("parties")
    .select(
      `id, entity_id, party_type, code, name, name_ar, trn, tax_treatment,
       control_account_id, default_tax_code_id, credit_limit, payment_terms_days,
       contact_person, email, phone, address_line1, address_line2, city, country,
       is_active, created_at`
    )
    .eq("entity_id", entityId)
    .order("name");

  if (error) {
    console.error("Error fetching parties:", error);
    return [];
  }

  return data ?? [];
}

export async function createParty(input: PartyInput): Promise<PartyActionResult> {
  try {
    const validated = partySchema.parse(input);
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "Authentication required." };

    const { data, error } = await supabase
      .from("parties")
      .insert({
        entity_id: validated.entity_id,
        party_type: validated.party_type,
        code: validated.code || null,
        name: validated.name,
        name_ar: validated.name_ar || null,
        trn: validated.trn || null,
        tax_treatment: validated.tax_treatment,
        control_account_id: validated.control_account_id || null,
        default_tax_code_id: validated.default_tax_code_id || null,
        credit_limit: validated.credit_limit ?? null,
        payment_terms_days: validated.payment_terms_days ?? null,
        contact_person: validated.contact_person || null,
        email: validated.email || null,
        phone: validated.phone || null,
        address_line1: validated.address_line1 || null,
        address_line2: validated.address_line2 || null,
        city: validated.city || null,
        country: validated.country || "AE",
        is_active: true,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: `A party named "${validated.name}" already exists.` };
      }
      return { success: false, error: error.message };
    }

    revalidatePath("/masters/parties");
    return { success: true, partyId: data.id };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: err.issues.map((i) => i.message).join(". ") };
    }
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateParty(
  partyId: string,
  input: PartyInput
): Promise<PartyActionResult> {
  try {
    const validated = partySchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("parties")
      .update({
        party_type: validated.party_type,
        code: validated.code || null,
        name: validated.name,
        name_ar: validated.name_ar || null,
        trn: validated.trn || null,
        tax_treatment: validated.tax_treatment,
        control_account_id: validated.control_account_id || null,
        default_tax_code_id: validated.default_tax_code_id || null,
        credit_limit: validated.credit_limit ?? null,
        payment_terms_days: validated.payment_terms_days ?? null,
        contact_person: validated.contact_person || null,
        email: validated.email || null,
        phone: validated.phone || null,
        address_line1: validated.address_line1 || null,
        address_line2: validated.address_line2 || null,
        city: validated.city || null,
        country: validated.country || "AE",
      })
      .eq("id", partyId);

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: `A party named "${validated.name}" already exists.` };
      }
      return { success: false, error: error.message };
    }

    revalidatePath("/masters/parties");
    return { success: true, partyId };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: err.issues.map((i) => i.message).join(". ") };
    }
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function togglePartyStatus(
  partyId: string,
  isActive: boolean
): Promise<PartyActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("parties").update({ is_active: isActive }).eq("id", partyId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/masters/parties");
  return { success: true, partyId };
}

export async function deleteParty(partyId: string): Promise<PartyActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("parties").delete().eq("id", partyId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/masters/parties");
  return { success: true, partyId };
}
