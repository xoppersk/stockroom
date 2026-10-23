import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "./next-path";
import type { Database } from "./types";

/**
 * Session refresh + route protection for the v2 app (adapted from the proven
 * v1 helper to v2's route map):
 *
 *   * The session cookie is refreshed on every matched request — this is
 *     what keeps users signed in.
 *   * /admin/*   — staff console. Signed-out visitors redirect to
 *     /admin/login. The ROLE gate itself lives server-side in the admin
 *     (shell) layout (it calls public.current_role()); middleware only
 *     guarantees a session, never renders role decisions from JWT claims.
 *   * /account/* — customer account. Signed-out visitors redirect to
 *     /account/login, except the four public auth pages.
 *   * Everything else (storefront, /dev/components, api routes) is public:
 *     the request passes through with refreshed cookies only.
 */

const ADMIN_LOGIN = "/admin/login";
const ACCOUNT_LOGIN = "/account/login";

/** /account pages reachable while signed out (the auth flows themselves). */
const PUBLIC_ACCOUNT_PATHS = [
  "/account/login",
  "/account/register",
  "/account/reset-password",
  "/account/update-password",
] as const;

function isPathOrChild(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Never trust a client-supplied user id — ask the auth server.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  /** Redirect that keeps any refreshed session cookies from this request. */
  function redirectTo(path: string, keepNext: boolean): NextResponse {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    if (keepNext) url.searchParams.set("next", safeNextPath(pathname, pathname));
    const response = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
    return response;
  }

  if (!user && isPathOrChild(pathname, "/admin") && pathname !== ADMIN_LOGIN) {
    return redirectTo(ADMIN_LOGIN, true);
  }

  if (
    !user &&
    isPathOrChild(pathname, "/account") &&
    !PUBLIC_ACCOUNT_PATHS.some((p) => pathname === p)
  ) {
    return redirectTo(ACCOUNT_LOGIN, true);
  }

  return supabaseResponse;
}
