"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  costCentreDimensionSchema,
  costCentreSchema,
  type CostCentreDimensionInput,
  type CostCentreInput,
} from "@/lib/validations/masters";

export interface CostCentreActionResult {
  success: boolean;
  id?: string;
  error?: string;
}

export async function getCostCentreDimensions(entityId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("cost_centre_dimensions")
    .select("id, entity_id, dimension_type, name, code, description, is_mandatory, is_active, sort_order")
    .eq("entity_id", entityId)
    .order("sort_order");

  if (error) {
    console.error("Error fetching cost centre dimensions:", error);
    return [];
  }

  return data ?? [];
}

export async function getCostCentres(entityId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("cost_centres")
    .select(
      `id, entity_id, dimension_id, code, name, parent_id, level, is_group, is_active,
       budget, start_date, end_date, created_at`
    )
    .eq("entity_id", entityId)
    .order("name");

  if (error) {
    console.error("Error fetching cost centres:", error);
    return [];
  }

  return data ?? [];
}

export async function createCostCentreDimension(
  input: CostCentreDimensionInput
): Promise<CostCentreActionResult> {
  try {
    const validated = costCentreDimensionSchema.parse(input);
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "Authentication required." };

    const { data, error } = await supabase
      .from("cost_centre_dimensions")
      .insert({
        entity_id: validated.entity_id,
        dimension_type: validated.dimension_type,
        name: validated.name,
        code: validated.code,
        description: validated.description || null,
        is_mandatory: validated.is_mandatory,
        sort_order: validated.sort_order,
        is_active: true,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };

    revalidatePath("/masters/cost-centres");
    return { success: true, id: data.id };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: err.issues.map((i) => i.message).join(". ") };
    }
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function createCostCentre(input: CostCentreInput): Promise<CostCentreActionResult> {
  try {
    const validated = costCentreSchema.parse(input);
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "Authentication required." };

    let level = 1;
    if (validated.parent_id) {
      const { data: parent } = await supabase
        .from("cost_centres")
        .select("level")
        .eq("id", validated.parent_id)
        .maybeSingle();

      if (parent) {
        level = (parent.level ?? 1) + 1;
      }
    }

    const { data, error } = await supabase
      .from("cost_centres")
      .insert({
        entity_id: validated.entity_id,
        dimension_id: validated.dimension_id,
        code: validated.code,
        name: validated.name,
        parent_id: validated.parent_id || null,
        level,
        is_group: validated.is_group,
        budget: validated.budget ?? null,
        start_date: validated.start_date || null,
        end_date: validated.end_date || null,
        is_active: true,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };

    revalidatePath("/masters/cost-centres");
    return { success: true, id: data.id };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: err.issues.map((i) => i.message).join(". ") };
    }
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateCostCentre(
  id: string,
  input: CostCentreInput
): Promise<CostCentreActionResult> {
  try {
    const validated = costCentreSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("cost_centres")
      .update({
        dimension_id: validated.dimension_id,
        code: validated.code,
        name: validated.name,
        parent_id: validated.parent_id || null,
        is_group: validated.is_group,
        budget: validated.budget ?? null,
        start_date: validated.start_date || null,
        end_date: validated.end_date || null,
      })
      .eq("id", id);

    if (error) return { success: false, error: error.message };

    revalidatePath("/masters/cost-centres");
    return { success: true, id };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: err.issues.map((i) => i.message).join(". ") };
    }
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function toggleCostCentreStatus(
  id: string,
  isActive: boolean
): Promise<CostCentreActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("cost_centres").update({ is_active: isActive }).eq("id", id);

  if (error) return { success: false, error: error.message };

  revalidatePath("/masters/cost-centres");
  return { success: true, id };
}

export async function deleteCostCentre(id: string): Promise<CostCentreActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("cost_centres").delete().eq("id", id);

  if (error) return { success: false, error: error.message };

  revalidatePath("/masters/cost-centres");
  return { success: true, id };
}
