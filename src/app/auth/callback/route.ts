import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth/redirect-path";
import type { Database } from "@/lib/supabase/types";

/**
 * GET /auth/callback — exchanges the Supabase auth `code` for a session.
 *
 * Used by magic links, signup confirmations, and password-reset emails, all of
 * which are configured with emailRedirectTo / redirectTo pointing here with a
 * `?next=` target. The `next` value is sanitized with safeNextPath() to block
 * open redirects.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    // Build the redirect response first so setAll() can attach the session
    // cookies to it — that's what keeps the user signed in after the hop.
    const response = NextResponse.redirect(new URL(next, origin));

    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return response;
    }
  }

  // Missing/invalid/expired code — send the user somewhere useful, not a 500.
  return NextResponse.redirect(new URL("/auth/auth-code-error", origin));
}
