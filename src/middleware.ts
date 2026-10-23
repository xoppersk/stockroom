import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

/**
 * Root middleware (Next 16 still honours this convention; the logic lives in
 * src/lib/supabase/middleware.ts, the v1-proven helper shape).
 *
 * Refreshes the Supabase session on every matched request and guards the
 * /admin and /account trees. The matcher stays tight: static assets, image
 * optimisation and metadata files never pay the auth round-trip.
 */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
