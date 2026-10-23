/* /account — signed-in customer home. Server-rendered from the real
   Supabase session: profile from public.profiles (own row, RLS self-read),
   with the auth user as fallback if the profile row hasn't landed yet.
   Middleware already redirects signed-out visitors to /account/login; the
   check here is defence in depth. */
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/account/login?next=/account");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name, created_at")
    .eq("id", user.id)
    .maybeSingle();

  const email = profile?.email ?? user.email ?? "";
  const fullName =
    profile?.full_name ??
    (typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : "") ??
    "";
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "56px 0 80px" }}>
      <h1
        style={{
          margin: 0,
          font: "800 44px/1.02 var(--font-sans)",
          fontStretch: "72%",
          textTransform: "uppercase",
        }}
      >
        Your account
      </h1>
      <p style={{ margin: "12px 0 0", fontSize: 16, lineHeight: 1.6, color: "var(--ink-2)" }}>
        Signed in{fullName ? (
          <>
            {" "}
            as <b style={{ color: "var(--store-ink)" }}>{fullName}</b>
          </>
        ) : null}
        {memberSince ? <> · customer since {memberSince}</> : null}.
      </p>

      <div className="panel" style={{ marginTop: 28, padding: "24px 26px" }}>
        <div className="f" style={{ gap: 2 }}>
          <span className="lbl">Email</span>
          <span className="mono" style={{ fontSize: 15 }}>
            {email}
          </span>
        </div>
        {fullName ? (
          <div className="f" style={{ gap: 2, marginTop: 16 }}>
            <span className="lbl">Full name</span>
            <span style={{ fontSize: 15 }}>{fullName}</span>
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            marginTop: 24,
            paddingTop: 20,
            borderTop: "1px solid var(--rule)",
          }}
        >
          <Link href="/account/orders" className="sbtn">
            Your orders
          </Link>
          <SignOutButton className="sbtn ol" />
        </div>
      </div>

      <p className="terms-line" style={{ marginTop: 18, textAlign: "left" }}>
        Need a new password? <Link href="/account/reset-password">Reset it by email</Link> —
        you will be signed out everywhere and can sign back in with the new one.
      </p>
    </div>
  );
}
