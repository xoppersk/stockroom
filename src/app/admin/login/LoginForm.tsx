"use client";
/* A-04 staff sign-in — REAL Supabase Auth (replaces the fixture form that
   shipped pre-filled credentials in a permanently drawn error state).
 *
 * Flow: signInWithPassword, then rpc('current_role') — the SECURITY
 * DEFINER lookup over public.user_roles. A null role means the account
 * exists but has no staff access: we sign it straight back out and say so.
 * The (shell) layout re-checks the same gate server-side on every console
 * page, so this form is never the only line of defence.
 *
 * The "Email me a sign-in link" option uses signInWithOtp with
 * shouldCreateUser:false and answers with the same sentence whether or
 * not the email has an account — no account-existence leak. Magic links
 * land back here with a code, which the mount effect exchanges before
 * running the same role check. */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { createClient } from "@/lib/supabase/client";
import { establishSessionFromUrl } from "@/lib/supabase/url-session";

const NO_ACCESS = "This account has no staff access.";

function AlertIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="#B91C1C"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 1.8 14.6 13.5H1.4z" />
      <path d="M8 6.2v3.6M8 11.6v.4" />
    </svg>
  );
}

export default function LoginForm({ denied = false }: { denied?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(denied ? NO_ACCESS : null);
  const [pending, setPending] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [linkPending, setLinkPending] = useState(false);
  const exchangeRan = useRef(false);

  /** After any successful sign-in: role-check, then enter or eject. */
  async function enterConsoleIfStaff(): Promise<boolean> {
    const supabase = createClient();
    const { data: role, error: roleError } = await supabase.rpc("current_role");
    if (!roleError && typeof role === "string" && role.length > 0) {
      router.replace("/admin");
      router.refresh();
      return true;
    }
    await supabase.auth.signOut();
    setError(NO_ACCESS);
    return false;
  }

  // Magic-link / confirmation landings arrive with ?code= — exchange it,
  // then run the same role gate as a password sign-in.
  useEffect(() => {
    if (exchangeRan.current) return;
    exchangeRan.current = true;
    const supabase = createClient();
    void establishSessionFromUrl(supabase).then(async (outcome) => {
      if (outcome.kind === "session") {
        await enterConsoleIfStaff();
      } else if (outcome.kind === "error") {
        setError(
          "That sign-in link didn't work — it may have expired or already been used. Sign in with your password instead.",
        );
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setLinkSent(false);

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

    await enterConsoleIfStaff();
    setPending(false);
  }

  async function onMagicLink() {
    if (email.trim() === "") {
      setError("Enter your email above first — the sign-in link is sent to that address.");
      return;
    }
    setLinkPending(true);
    setError(null);

    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/admin/login`,
      },
    });

    if (otpError) {
      setError(otpError.message);
      setLinkPending(false);
      return;
    }

    setLinkSent(true);
    setLinkPending(false);
  }

  return (
    <form className="adm-login-form" aria-labelledby="si" onSubmit={onSubmit}>
      <div className="adm-login-form-head">
        <h1 id="si">Sign in</h1>
        <span className="adm-login-form-sub">To your store’s Stockroom.</span>
      </div>

      {error ? (
        <div role="alert" className="adm-login-alert">
          <AlertIcon />
          <span>{error}</span>
        </div>
      ) : null}

      <div>
        <label htmlFor="em" className="adm-login-lb">
          Email
        </label>
        <input
          id="em"
          className="adm-login-input"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div>
        <div className="adm-login-lb">
          <label htmlFor="pw">Password</label>
          <Link href="/account/reset-password">Forgot it?</Link>
        </div>
        <input
          id="pw"
          className={`adm-login-input${error ? " adm-login-input--error" : ""}`}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
      </div>

      <button type="submit" className="adm-login-submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>

      <div className="adm-login-divider" aria-hidden="true">
        or
      </div>

      <button
        type="button"
        className="adm-login-alt"
        onClick={onMagicLink}
        disabled={linkPending}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 16 16"
          fill="none"
          stroke="#1C1917"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="1.5" y="3.5" width="13" height="9" rx="1" />
          <path d="m2 4.2 6 4.6 6-4.6" />
        </svg>
        {linkPending ? "Sending…" : "Email me a sign-in link"}
      </button>

      {linkSent ? (
        <p role="status" className="adm-login-status">
          If that email has an account, a sign-in link is on its way.
        </p>
      ) : null}

      <p className="adm-login-note">
        No account? Ask your store owner for an invite. Shoppers sign in on the
        storefront, not here.
      </p>
    </form>
  );
}
