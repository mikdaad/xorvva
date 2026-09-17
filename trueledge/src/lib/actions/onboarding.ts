"use server";

import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  onboardingSchema,
  entitySchema,
  accountingSettingsSchema,
  type OnboardingInput,
  type EntityInput,
  type AccountingSettingsInput,
} from "@/lib/validations/onboarding";
import { buildExtraLedgers } from "@/lib/coa-templates";
import type { EntityType, TaxTreatment } from "@/types/database.types";
import { z } from "zod";

export interface OnboardingActionResult {
  success: boolean;
  organisationId?: string;
  entityId?: string;
  error?: string;
}

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 40);
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `${base}-${randomSuffix}`;
}

/**
 * Task 1: Transactional Onboarding Server Action
 * Creates Organisation, Roles, User Links, Entity, Fiscal Year, Monthly Periods, Tax Codes, and COA.
 */
export async function completeOnboardingAction(
  rawInput: OnboardingInput
): Promise<OnboardingActionResult> {
  try {
    const validated = onboardingSchema.parse(rawInput);
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Authentication required. Please log in." };
    }

    // 1. Create Organisation
    const { data: org, error: orgErr } = await supabase
      .from("organisations")
      .insert({
        name: validated.org_name,
        slug: generateSlug(validated.org_name),
        status: "active",
        subscription_tier: validated.subscription_tier ?? "trial",
        created_by: user.id,
      })
      .select("id")
      .single();

    if (orgErr || !org) {
      return { success: false, error: `Failed to create organisation: ${orgErr?.message}` };
    }

    // 2. Create System Roles for Organisation
    const { data: adminRole, error: roleErr } = await supabase
      .from("roles")
      .insert({
        organisation_id: org.id,
        name: "admin",
        description: "Full administrative access",
        is_system: true,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (roleErr || !adminRole) {
      return { success: false, error: `Failed to create admin role: ${roleErr?.message}` };
    }

    await supabase.from("roles").insert([
      {
        organisation_id: org.id,
        name: "accountant",
        description: "Can manage transactions, journals, and bank reconciliations",
        is_system: true,
        created_by: user.id,
      },
      {
        organisation_id: org.id,
        name: "viewer",
        description: "Read-only access to financial reports and audit trail",
        is_system: true,
        created_by: user.id,
      },
    ]);

    // 3. Link User to Organisation as Owner
    const { error: orgUserErr } = await supabase
      .from("organisation_users")
      .insert({
        organisation_id: org.id,
        user_id: user.id,
        role_id: adminRole.id,
        is_owner: true,
        is_active: true,
        created_by: user.id,
      });

    if (orgUserErr) {
      return { success: false, error: `Failed to link user to organisation: ${orgUserErr.message}` };
    }

    // 4. Create Initial Entity (The Company)
    const entityResult = await createEntityInternal(supabase, {
      organisation_id: org.id,
      user_id: user.id,
      role_id: adminRole.id,
      entity_data: validated,
    });

    if (!entityResult.success) {
      return entityResult;
    }

    // Refresh Supabase auth session
    await supabase.auth.refreshSession();

    return {
      success: true,
      organisationId: org.id,
      entityId: entityResult.entityId,
    };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: err.issues.map((i) => i.message).join(". ") };
    }
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const createEntitySchemaCombined = entitySchema
  .merge(accountingSettingsSchema)
  .extend({ organisation_id: z.string().uuid() });

export type CreateEntityInput = z.infer<typeof createEntitySchemaCombined>;

/**
 * Create a new entity (Company) under an existing Organisation
 */
export async function createEntityAction(
  rawInput: CreateEntityInput
): Promise<OnboardingActionResult> {
  try {
    const validated = createEntitySchemaCombined.parse(rawInput);
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Authentication required." };
    }

    // Verify user belongs to org
    const { data: orgUser } = await supabase
      .from("organisation_users")
      .select("role_id")
      .eq("organisation_id", validated.organisation_id)
      .eq("user_id", user.id)
      .single();

    if (!orgUser) {
      return { success: false, error: "You do not have access to this organisation." };
    }

    const res = await createEntityInternal(supabase, {
      organisation_id: validated.organisation_id,
      user_id: user.id,
      role_id: orgUser.role_id,
      entity_data: validated,
    });

    return res;
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: err.issues.map((i) => i.message).join(". ") };
    }
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Internal helper for entity creation.
//
// Delegates the whole company-creation sequence — entity, owner grant, fiscal
// year, 13 periods, Tally chart of accounts, default ledgers and UAE VAT codes
// — to the `create_entity_with_defaults` RPC so it commits or rolls back as a
// single transaction. The previous implementation issued ~10 sequential calls,
// which could leave an orphaned entity with a partial chart behind.
async function createEntityInternal(
  supabase: SupabaseClient,
  opts: {
    organisation_id: string;
    user_id: string;
    role_id: string | null;
    entity_data: EntityInput & AccountingSettingsInput;
  }
): Promise<OnboardingActionResult> {
  const { organisation_id, role_id, entity_data } = opts;
  const template = entity_data.coa_template || "trading";

  const { data: entityId, error } = await supabase.rpc("create_entity_with_defaults", {
    p_organisation_id: organisation_id,
    p_trade_name: entity_data.trade_name,
    p_mailing_name: entity_data.mailing_name || null,
    p_legal_name: entity_data.legal_name || null,
    p_trn: entity_data.trn || null,
    p_corporate_tax_trn: entity_data.corporate_tax_trn || null,
    p_entity_type: entity_data.entity_type as EntityType,
    p_tax_treatment: entity_data.tax_treatment as TaxTreatment,
    p_address_line1: entity_data.address_line1 || null,
    p_city: entity_data.city || "Dubai",
    p_emirate: entity_data.emirate || "Dubai",
    p_country: "AE",
    p_phone: entity_data.phone || null,
    p_email: entity_data.email || null,
    p_is_free_zone: entity_data.is_free_zone ?? false,
    p_free_zone_name: entity_data.free_zone_name || null,
    p_base_currency: entity_data.base_currency || "AED",
    p_decimal_places: entity_data.decimal_places ?? 2,
    p_fiscal_year_start: entity_data.fiscal_year_start || null,
    p_books_begin_date: entity_data.books_begin_date || entity_data.fiscal_year_start || null,
    p_coa_template: template,
    p_extra_ledgers: buildExtraLedgers(template),
    p_role_id: role_id,
  });

  if (error || !entityId) {
    return {
      success: false,
      error: `Failed to create company: ${error?.message ?? "no entity returned"}`,
    };
  }

  return { success: true, entityId: entityId as string };
}
