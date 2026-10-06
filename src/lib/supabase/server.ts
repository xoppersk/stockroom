import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "./types";

/**
 * Server-side Supabase client. Creates a fresh client per request so auth
 * cookies stay scoped to the current request — never share across requests.
 *
 * Use in Server Components, Route Handlers, and Server Actions:
 *
 *   const supabase = await createClient();
 *   const { data } = await supabase.from("profiles").select("*");
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component where setting cookies is not
            // allowed. The middleware refreshes the session instead.
          }
        },
      },
    },
  );
}
