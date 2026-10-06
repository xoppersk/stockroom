"use server";

import { refresh } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

export type UpdateProfileResult = { ok: true } | { ok: false; error: string };

const MAX_NAME_LENGTH = 100;

/**
 * Updates the signed-in user's own profile row. RLS (`profiles_self_update`)
 * enforces ownership in the database too — this action never touches another
 * user's row, even if the id were spoofed.
 */
export async function updateProfile(formData: FormData): Promise<UpdateProfileResult> {
  const user = await requireUser("/app/account");

  const fullName = String(formData.get("full_name") ?? "").trim();

  if (fullName.length === 0) {
    return { ok: false, error: "Full name is required." };
  }
  if (fullName.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `Full name must be ${MAX_NAME_LENGTH} characters or fewer.` };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);

  if (error) {
    return { ok: false, error: "Couldn't save your profile. Please try again." };
  }

  // Re-render server components so the header picks up the new name.
  refresh();
  return { ok: true };
}
