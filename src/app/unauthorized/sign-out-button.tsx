"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

/**
 * Sign-out action for the unauthorized page's "no access yet" state: the
 * account has no role, so there is no dashboard to go back to — the useful
 * next step is signing out (e.g. to switch to an account with access).
 * Mirrors the user menu's sign-out.
 */
export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Button variant="outline" className="mt-2" onClick={() => void signOut()}>
      <LogOut className="size-4" aria-hidden />
      Sign out
    </Button>
  );
}
