"use server";

import { isValidRole, requireRole, type UserRole } from "@/lib/auth/roles";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type InviteStaffResult = { ok: true; email: string } | { ok: false; error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/**
 * Admin-only staff invite (IMPLEMENTATION-PLAN.md Phase 1).
 *
 * Sends a Supabase auth invite to `email`, then grants `role` in
 * `public.user_roles`. The `on_auth_user_created` trigger creates the
 * profile row when the invitee first signs in; the role row is written here
 * up front so the account works on first sign-in.
 */
export async function inviteStaffMember(formData: FormData): Promise<InviteStaffResult> {
  const { user: admin } = await requireRole("admin", "/settings");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "").trim();

  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (!isValidRole(role)) {
    return { ok: false, error: "Pick a valid role: admin, warehouse, or support." };
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Service-role key is not configured.",
    };
  }

  // inviteUserByEmail creates the auth.users row (or re-sends if it exists)
  // and emails the invite link through /auth/callback.
  const { data, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl()}/auth/callback?next=/dashboard`,
    data: { full_name: email.split("@")[0] },
  });

  if (inviteError || !data.user) {
    return { ok: false, error: inviteError?.message ?? "Couldn't send the invite. Try again." };
  }

  const { error: roleError } = await supabase.from("user_roles").upsert(
    { user_id: data.user.id, role: role as UserRole, granted_by: admin.id },
    { onConflict: "user_id" },
  );

  if (roleError) {
    return { ok: false, error: "Invite sent, but the role couldn't be saved. Try again." };
  }

  return { ok: true, email };
}
