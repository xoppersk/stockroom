"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";

export type UrlSessionOutcome =
  | { kind: "session" }
  | { kind: "none" }
  | { kind: "error"; message: string };

/**
 * Establishes a session from an auth email link landing on a page in this
 * app (sign-up confirmation, magic link, password recovery).
 *
 * Supabase email links verify at the auth server and redirect back with a
 * PKCE `?code=` (or an `?error=`/`#error=` when the link expired or was
 * already used). The browser client usually exchanges the code itself on
 * load; this helper checks for an existing session first and only exchanges
 * manually when that hasn't happened, then re-checks once — so the two
 * paths never fight over the single-use code.
 *
 * Client-side only (reads window.location). Call from an effect.
 */
export async function establishSessionFromUrl(
  supabase: SupabaseClient<Database>,
): Promise<UrlSessionOutcome> {
  const url = new URL(window.location.href);
  const errorDescription =
    url.searchParams.get("error_description") ??
    new URLSearchParams(url.hash.replace(/^#/, "")).get("error_description");
  if (errorDescription) {
    return { kind: "error", message: errorDescription };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) return { kind: "session" };

  const code = url.searchParams.get("code");
  if (!code) return { kind: "none" };

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) return { kind: "session" };

  // The client's own URL detection may have consumed the code first —
  // a live session is the ground truth, not the exchange error.
  const {
    data: { session: retrySession },
  } = await supabase.auth.getSession();
  if (retrySession) return { kind: "session" };

  return { kind: "error", message: error.message };
}
