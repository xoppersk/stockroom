"use client";
/* /account/register — real public registration through Supabase Auth.
   signUp carries full_name in user metadata; the on_auth_user_created
   trigger copies it into public.profiles. Two honest outcomes:
     * session returned  → the project allows immediate sign-in: go to /account.
     * no session        → email confirmation is required: show the
                           "check your email" state. Never fake success. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { createClient } from "@/lib/supabase/client";
import { AuthAlert, AuthPanel } from "../_components/auth-shell";

export default function RegisterForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        // Confirmation links land on the login page, which exchanges the
        // code for a session and forwards to /account.
        emailRedirectTo: `${window.location.origin}/account/login`,
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setPending(false);
      return;
    }

    if (data.session) {
      router.push("/account");
      router.refresh();
      return;
    }

    // No session: either confirmation is required, or this email is already
    // registered (GoTrue answers identically on purpose — no account leak).
    setConfirmationSent(true);
    setPending(false);
  }

  if (confirmationSent) {
    return (
      <AuthPanel
        title="Check your email"
        sub={`We sent a confirmation link to ${email}. Click it to finish creating your account, then sign in.`}
        footer={
          <>
            Already confirmed? <Link href="/account/login">Sign in</Link>
          </>
        }
      >
        <AuthAlert tone="info">
          No email after a few minutes? Check spam — or try signing in: if this
          address already has an account, that is where you will land.
        </AuthAlert>
      </AuthPanel>
    );
  }

  return (
    <AuthPanel
      title="Create account"
      sub="One account for orders, tracking and faster checkout at Larder & Loom."
      footer={
        <>
          Already have an account? <Link href="/account/login">Sign in</Link>
        </>
      }
    >
      <form className="co-form" onSubmit={onSubmit}>
        {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}

        <div className="f">
          <label htmlFor="rg-name">Full name</label>
          <input
            id="rg-name"
            className="in"
            type="text"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>

        <div className="f">
          <label htmlFor="rg-email">Email</label>
          <input
            id="rg-email"
            className="in"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="f">
          <label htmlFor="rg-password">Password</label>
          <input
            id="rg-password"
            className="in"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button type="submit" className="sbtn" style={{ width: "100%" }} disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthPanel>
  );
}
