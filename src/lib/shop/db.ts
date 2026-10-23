import { createServerClient } from "@supabase/ssr";
import { createClient as createBareClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import type { ShopDatabase } from "./types";

/**
 * Storefront Supabase clients (adapted from v1 `src/lib/shop/db.ts`).
 *
 * Self-contained on purpose: v2 has no `src/lib/supabase/**` yet (W-AUTH
 * owns it), so the shop layer builds its own clients and never imports
 * from another worker's territory.
 *
 * Three flavours:
 * - `createShopUserClient()` — SSR client bound to the request's auth
 *   cookies. RLS applies AS THE CALLER (anon when signed out). Catalog
 *   reads and the customer's own-order reads go through this so RLS —
 *   not application code — decides what is visible.
 * - `createShopAnonClient()` — key-only anon client (no cookies). For
 *   catalog reads outside a request-cookie context.
 * - `createShopServiceClient()` — service role, BYPASSES RLS. Returns
 *   null when SUPABASE_SERVICE_ROLE_KEY is not configured (it exists only
 *   in Vercel production env, not in the local shell). Callers must treat
 *   null as a hard failure for cart/checkout writes — never fall back to
 *   fixture data. Used ONLY where v1 used it: carts/cart_items (guest-token
 *   RLS reads `app.guest_token`, which no migration lets app code set per
 *   request), inventory_levels (no anon grant), guest order reads, and
 *   the checkout RPC. Every service query is scoped by guest_token /
 *   user_id in application code.
 */

export type ShopClient = SupabaseClient<ShopDatabase>;

/** Name of the HttpOnly cookie holding the guest cart token (v1 name). */
export const CART_COOKIE = "stockroom_cart";

export function productImageUrl(storagePath: string): string {
  if (/^https?:\/\//.test(storagePath)) return storagePath;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/product-images/${storagePath}`;
}

function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured.");
  return url;
}

function anonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured.");
  return key;
}

/** SSR client as the current caller (auth cookies). Server only. */
export async function createShopUserClient(): Promise<ShopClient> {
  const cookieStore = await cookies();
  return createServerClient<ShopDatabase>(supabaseUrl(), anonKey(), {
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
          // Server Component context: cookie writes are not allowed; the
          // middleware (W-AUTH) refreshes the session instead.
        }
      },
    },
  }) as unknown as ShopClient;
}

/** Plain anon client (no session). Server only. */
export function createShopAnonClient(): ShopClient {
  return createBareClient<ShopDatabase>(supabaseUrl(), anonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as ShopClient;
}

/**
 * Service-role client, or null when the key is absent. Server only —
 * never import from a Client Component.
 */
export function createShopServiceClient(): ShopClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createBareClient<ShopDatabase>(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as ShopClient;
}

/** Service client or a thrown, clearly-logged configuration error. */
export function requireShopServiceClient(context: string): ShopClient {
  const svc = createShopServiceClient();
  if (!svc) {
    console.error(
      `[shop] ${context}: SUPABASE_SERVICE_ROLE_KEY is not configured in this environment. ` +
        "Cart/checkout writes require it (guest-token RLS cannot be satisfied from the anon key). " +
        "It is set in Vercel production; this environment cannot complete the operation.",
    );
    throw new ShopServiceUnavailableError(context);
  }
  return svc;
}

export class ShopServiceUnavailableError extends Error {
  constructor(context: string) {
    super(`Service role is not configured (${context}).`);
    this.name = "ShopServiceUnavailableError";
  }
}

/** The signed-in user's id from the request session, or null. */
export async function getSessionUserId(client?: ShopClient): Promise<string | null> {
  const c = client ?? (await createShopUserClient());
  const { data } = await c.auth.getUser();
  return data.user?.id ?? null;
}
