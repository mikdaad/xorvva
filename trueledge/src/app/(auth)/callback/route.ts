import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Auth callback handler for email confirmations, magic links, and OAuth.
 * Exchanges the auth code for a session and redirects to the appropriate page.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/onboarding";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Check if the user already has an org — if so, go to dashboard
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: orgMembership } = await supabase
          .from("organisation_users")
          .select("id")
          .eq("user_id", user.id)
          .limit(1)
          .single();

        if (orgMembership) {
          // Existing user with an org → dashboard
          return NextResponse.redirect(`${origin}/dashboard`);
        }
      }

      // New user → onboarding
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // If code exchange fails, redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
