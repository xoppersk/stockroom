import { createClient } from "@supabase/supabase-js";

import type { Database } from "./types";

/**
 * Service-role Supabase client — bypasses RLS. Server only.
 *
 * Use ONLY for operations that cannot run as the signed-in user: the staff
 * invite flow (`auth.admin.inviteUserByEmail`) and the Stripe webhook route.
 * Never import this from a Client Component, and never leak its key.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured. Add it to .env.local (see .env.example).",
    );
  }

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
