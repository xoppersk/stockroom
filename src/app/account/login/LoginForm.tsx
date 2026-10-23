"use client";
/* /account/login — real sign-in with Supabase Auth (signInWithPassword).
   Also the landing page for sign-up confirmation links: the email link
   returns here with a PKCE code, which establishSessionFromUrl exchanges
   before we forward the (now signed-in) shopper to their account. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { createClient } from "@/lib/supabase/client";
import { establishSessionFromUrl } from "@/lib/supabase/url-session";
import { AuthAlert, AuthPanel } from "../_components/auth-shell";

export default function LoginForm({
  next,
  passwordUpdated,
}: {
  next: string;
  passwordUpdated: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const exchangeRan = useRef(false);

  useEffect(() => {
    if (exchangeRan.current) return;
    exchangeRan.current = true;
    const supabase = createClient();
    void establishSessionFromUrl(supabase).then((outcome) => {
      if (outcome.kind === "session") {
        router.replace(next);
        router.refresh();
      } else if (outcome.kind === "error") {
        setError(
          "That email link didn't work — it may have expired or already been used. Sign in below, or request a fresh link.",
        );
      }
    });
  }, [next, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(
        signInError.message === "Invalid login credentials"
          ? "That email and password don't match. Check for typos, or reset your password."
          : signInError.message,
      );
      setPending(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <AuthPanel
      title="Sign in"
      sub="To your Larder & Loom account — orders, tracking and faster checkout."
      footer={
        <>
          New here? <Link href="/account/register">Create an account</Link>
        </>
      }
    >
      <form className="co-form" onSubmit={onSubmit} noValidate={false}>
        {passwordUpdated ? (
          <AuthAlert tone="info">
            Your password has been updated. Sign in with the new one.
          </AuthAlert>
        ) : null}
        {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}

        <div className="f">
          <label htmlFor="li-email">Email</label>
          <input
            id="li-email"
            className="in"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="f">
          <label htmlFor="li-password">Password</label>
          <input
            id="li-password"
            className="in"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error ? true : undefined}
          />
        </div>

        <button type="submit" className="sbtn" style={{ width: "100%" }} disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>

        <p className="terms-line" style={{ margin: 0 }}>
          <Link href="/account/reset-password">Forgot your password?</Link>
        </p>
      </form>
    </AuthPanel>
  );
}
