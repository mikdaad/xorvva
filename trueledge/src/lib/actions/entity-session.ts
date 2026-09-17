"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setActiveEntity, clearActiveEntity } from "@/lib/entity-context";

export interface EntitySessionResult {
  success: boolean;
  error?: string;
}

/**
 * Makes an entity the active company and sends the user to its dashboard.
 *
 * Backs Tally's "Select Company" (Enter on a row) and "F1: Switch Company".
 * Membership is verified inside `setActiveEntity` before the cookie is written.
 *
 * NOTE: `redirect()` throws a control-flow signal that Next.js catches, so it
 * must be called outside any try/catch and nothing after it runs.
 */
export async function selectEntityAction(
  entityId: string
): Promise<EntitySessionResult | void> {
  if (!entityId) {
    return { success: false, error: "No company selected." };
  }

  const ok = await setActiveEntity(entityId);

  if (!ok) {
    return { success: false, error: "You do not have access to that company." };
  }

  // The active entity is read in the platform layout, so the whole tree needs
  // to re-render rather than just the destination page.
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/**
 * Switches the active company without navigating away from the current screen.
 *
 * Used by the header switcher, where Tally's behaviour is to stay on the same
 * report and re-scope it to the newly selected company.
 */
export async function switchEntityAction(entityId: string): Promise<EntitySessionResult> {
  if (!entityId) {
    return { success: false, error: "No company selected." };
  }

  const ok = await setActiveEntity(entityId);

  if (!ok) {
    return { success: false, error: "You do not have access to that company." };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

/** Clears the active company and returns the user to the company list. */
export async function clearEntityAction(): Promise<void> {
  await clearActiveEntity();
  revalidatePath("/", "layout");
  redirect("/entities");
}
