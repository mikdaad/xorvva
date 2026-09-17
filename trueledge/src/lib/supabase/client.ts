import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";

/**
 * Creates a Supabase client for use in browser (Client Components).
 * This client automatically manages cookies for session persistence.
 *
 * Usage:
 *   const supabase = createClient();
 *   const { data } = await supabase.from('accounts').select();
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
