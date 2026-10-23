"use client";
/* /account/reset-password — requests a Supabase recovery email. The link
   lands on /account/update-password, which establishes the recovery session
   from the URL code and sets the new password. The "sent" answer is the
   same whether or not the email has an account — no existence leak. */
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { createClient } from "@/lib/supabase/client";
import { AuthAlert, AuthPanel } from "../_components/auth-shell";

export default function ResetPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/account/update-password`,
    });

    if (resetError) {
      setError(resetError.message);
      setPending(false);
      return;
    }

    setSent(true);
    setPending(false);
  }

  if (sent) {
    return (
      <AuthPanel
        title="Check your email"
        sub="If that email has an account, a password-reset link is on its way. The link signs you in briefly so you can set a new password."
        footer={
          <>
            Remembered it after all? <Link href="/account/login">Sign in</Link>
          </>
        }
      >
        <AuthAlert tone="info">
          Links expire after a while and work once — if yours has lapsed, come
          back here and request a fresh one.
        </AuthAlert>
      </AuthPanel>
    );
  }

  return (
    <AuthPanel
      title="Reset password"
      sub="Enter the email on your account and we will send you a reset link."
      footer={
        <>
          Back to <Link href="/account/login">sign in</Link>
        </>
      }
    >
      <form className="co-form" onSubmit={onSubmit}>
        {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}

        <div className="f">
          <label htmlFor="rp-email">Email</label>
          <input
            id="rp-email"
            className="in"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <button type="submit" className="sbtn" style={{ width: "100%" }} disabled={pending}>
          {pending ? "Sending…" : "Email me a reset link"}
        </button>
      </form>
    </AuthPanel>
  );
}
