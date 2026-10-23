"use client";
/* Real sign-out: ends the Supabase session (clears the auth cookies via the
   browser client), then returns to the storefront and refreshes so every
   server component re-reads the now-signed-out session. */
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

export default function SignOutButton({
  className,
  label = "Sign out",
}: {
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button type="button" className={className} onClick={onClick} disabled={pending}>
      {pending ? "Signing out…" : label}
    </button>
  );
}
