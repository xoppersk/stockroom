import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Returns the currently authenticated user, or `null` when signed out.
 *
 * Uses `supabase.auth.getUser()` (server-validated), never the raw session
 * from cookies. Safe to call from Server Components and Route Handlers.
 */
export async function getUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
