/* Server-side account area for the storefront header. Reads the real
   Supabase session on the server (never a client guess): signed out shows
   "Sign in / Register"; signed in shows the shopper's first name linking
   to /account plus a working Sign out. Rendered by the (store) layout and
   passed through StoreShell into StoreHeader as a React node, because the
   header itself is a client component. */
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import SignOutButton from "../../account/SignOutButton";

function AccountIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="5.5" r="2.8" />
      <path d="M2.5 14c.8-2.8 3-4.2 5.5-4.2s4.7 1.4 5.5 4.2" />
    </svg>
  );
}

export async function AccountNav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <>
        <Link href="/account/login" className="nl">
          <AccountIcon />
          Sign in
        </Link>
        <Link href="/account/register" className="nl">
          Register
        </Link>
      </>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const fullName =
    profile?.full_name ??
    (typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : null) ??
    user.email ??
    "Account";
  const firstName = fullName.split(" ")[0] || "Account";

  return (
    <>
      <Link href="/account" className="nl" aria-label={`Account — ${fullName}`}>
        <AccountIcon />
        {firstName}
      </Link>
      <SignOutButton className="nl" />
    </>
  );
}
