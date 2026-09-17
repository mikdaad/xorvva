import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * The active company ("selected company" in Tally terms) for the current
 * session, stored in an httpOnly cookie.
 *
 * SECURITY: this cookie is a *convenience hint about which* entity the user is
 * looking at — never a grant of access to it. Every read of business data still
 * goes through RLS, which checks entity_users independently. `setActiveEntity`
 * additionally re-verifies membership before writing, so a forged or stale
 * cookie cannot widen access; the worst case is an empty screen.
 */
const ACTIVE_ENTITY_COOKIE = "tl_active_entity";

// Six months. The cookie is a UI preference, so a long life is fine — it is
// re-verified on write and enforced by RLS on every read.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  };
}

/**
 * Returns the active entity id from the cookie, or null when none is set.
 *
 * Does NOT verify access — callers must still query through RLS. Use
 * `requireActiveEntity` when the caller needs a verified entity.
 */
export async function getActiveEntityId(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACTIVE_ENTITY_COOKIE)?.value ?? null;
}

/**
 * Verifies the user has access to `entityId`, then makes it the active company.
 *
 * Returns false when the entity does not exist or the user has no membership,
 * in which case the cookie is left untouched.
 */
export async function setActiveEntity(entityId: string): Promise<boolean> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  // RLS on entity_users already restricts this to the caller's own rows; the
  // explicit user_id filter documents the intent and guards against a policy
  // change that widens SELECT.
  const { data: membership } = await supabase
    .from("entity_users")
    .select("entity_id")
    .eq("entity_id", entityId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!membership) return false;

  const store = await cookies();
  store.set(ACTIVE_ENTITY_COOKIE, entityId, cookieOptions());

  return true;
}

/** Clears the active company (e.g. on sign-out or when access is revoked). */
export async function clearActiveEntity(): Promise<void> {
  const store = await cookies();
  store.delete(ACTIVE_ENTITY_COOKIE);
}

/**
 * Returns the active entity id only if the current user still has access to it.
 *
 * Handles the case where a user's access was revoked after the cookie was set —
 * the stale value is reported as null rather than being trusted.
 */
export async function requireActiveEntity(): Promise<string | null> {
  const entityId = await getActiveEntityId();
  if (!entityId) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: membership } = await supabase
    .from("entity_users")
    .select("entity_id")
    .eq("entity_id", entityId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  return membership ? entityId : null;
}
