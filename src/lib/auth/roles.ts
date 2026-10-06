import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { getUser } from "./get-user";
import { requireUser } from "./require-user";

/**
 * Stockroom role model (replaces the starter's org-based access).
 *
 * Exactly one role per staff user, stored in `public.user_roles`:
 *   admin     — full access, incl. Settings and user management
 *   warehouse — orders fulfillment + inventory; never sees Settings
 *   support   — customers, orders support actions, apology discount codes
 *
 * Roles are read from the `user_roles` table on every call — RLS policies
 * never trust JWT claims for roles (DATABASE-SCHEMA.md §4).
 */
export type UserRole = "admin" | "warehouse" | "support";

const VALID_ROLES: readonly UserRole[] = ["admin", "warehouse", "support"];

export function isValidRole(value: unknown): value is UserRole {
  return typeof value === "string" && (VALID_ROLES as readonly string[]).includes(value);
}

/**
 * Returns the signed-in user's role, or `null` when signed out or when no
 * `user_roles` row exists yet (e.g. an invite was never completed).
 */
export async function currentRole(): Promise<UserRole | null> {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  return isValidRole(data?.role) ? data.role : null;
}

/** True when the signed-in user is an admin. */
export async function isAdmin(): Promise<boolean> {
  return (await currentRole()) === "admin";
}

/** True when the signed-in user holds any staff role. */
export async function isStaff(): Promise<boolean> {
  return (await currentRole()) !== null;
}

/**
 * Role choke point for Server Components, Route Handlers, and Server Actions.
 *
 *   const { user, role } = await requireRole("admin", "/settings");
 *
 * Failure behavior (deliberate):
 *   * signed out            → requireUser() redirects to /login?next=...
 *   * signed in, wrong role  → redirect("/dashboard") — never confirm the
 *                             protected page exists to an under-ranked user.
 *   * signed in, no role yet → redirect("/login") — an admin must grant a
 *                             role via Settings → Invite before the account
 *                             can use the app.
 */
export async function requireRole(
  roles: UserRole | readonly UserRole[],
  next?: string,
): Promise<{ user: User; role: UserRole }> {
  const user = await requireUser(next);
  const role = await currentRole();

  if (!role) {
    redirect("/login");
  }

  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!allowed.includes(role)) {
    redirect("/dashboard");
  }

  return { user, role };
}
