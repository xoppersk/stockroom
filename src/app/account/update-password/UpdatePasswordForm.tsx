"use client";
/* /account/update-password — the landing page for password-reset emails.
   The recovery link returns here with a PKCE code; establishSessionFromUrl
   turns it into a (recovery) session, and only then does the form call
   updateUser({ password }). A visit without a live recovery session shows
   an honest "this link didn't work" state — the form never pretends.
   On success we sign out and send the shopper to sign in fresh. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { createClient } from "@/lib/supabase/client";
import { establishSessionFromUrl } from "@/lib/supabase/url-session";
import { AuthAlert, AuthPanel } from "../_components/auth-shell";

type Phase = "checking" | "ready" | "invalid";

export default function UpdatePasswordForm() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const exchangeRan = useRef(false);

  useEffect(() => {
    if (exchangeRan.current) return;
    exchangeRan.current = true;
    const supabase = createClient();
    void establishSessionFromUrl(supabase).then((outcome) => {
      setPhase(outcome.kind === "session" ? "ready" : "invalid");
    });
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setPending(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(`${updateError.message} Request a new reset link and try again.`);
      setPending(false);
      return;
    }

    await supabase.auth.signOut();
    router.push("/account/login?note=password-updated");
    router.refresh();
  }

  if (phase === "checking") {
    return (
      <AuthPanel title="Set a new password" sub="Checking your reset link…">
        <AuthAlert tone="info">One moment while we verify the link from your email.</AuthAlert>
      </AuthPanel>
    );
  }

  if (phase === "invalid") {
    return (
      <AuthPanel
        title="That link didn't work"
        sub="Reset links expire and can only be used once. Request a fresh one and set your new password from there."
        footer={
          <>
            Back to <Link href="/account/login">sign in</Link>
          </>
        }
      >
        <Link href="/account/reset-password" className="sbtn" style={{ width: "100%" }}>
          Request a new reset link
        </Link>
      </AuthPanel>
    );
  }

  return (
    <AuthPanel
      title="Set a new password"
      sub="Choose a new password for your account. You will sign in with it next."
    >
      <form className="co-form" onSubmit={onSubmit}>
        {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}

        <div className="f">
          <label htmlFor="up-password">New password</label>
          <input
            id="up-password"
            className="in"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="f">
          <label htmlFor="up-confirm">Confirm new password</label>
          <input
            id="up-confirm"
            className="in"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        <button type="submit" className="sbtn" style={{ width: "100%" }} disabled={pending}>
          {pending ? "Updating…" : "Update password"}
        </button>
      </form>
    </AuthPanel>
  );
}
