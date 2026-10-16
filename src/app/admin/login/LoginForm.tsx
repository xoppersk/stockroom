"use client";
/* A-04 sign-in form, drawn in its ERROR state exactly as Login.html:
   the role="alert" banner, the password field with aria-invalid and a
   problem border, and the email pre-filled. Demo behaviour: submitting
   keeps the drawn error state (there is no staff backend in this
   phase). The "Email me a sign-in link" option answers with the same
   sentence whether or not the email has an account — no
   account-existence leak. */

import { useState } from "react";

export default function LoginForm() {
  const [linkSent, setLinkSent] = useState(false);

  return (
    <form
      className="adm-login-form"
      aria-labelledby="si"
      onSubmit={(e) => {
        /* Demo: the form stays in its drawn error state. */
        e.preventDefault();
      }}
    >
      <div className="adm-login-form-head">
        <h1 id="si">Sign in</h1>
        <span className="adm-login-form-sub">To your store’s Stockroom.</span>
      </div>

      <div role="alert" className="adm-login-alert">
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
        <span>
          <b>That email and password don’t match.</b> Check for typos, or reset
          your password. After 5 tries we pause sign-in for 15 minutes.
        </span>
      </div>

      <div>
        <label htmlFor="em" className="adm-login-lb">
          Email
        </label>
        <input
          id="em"
          className="adm-login-input"
          type="email"
          defaultValue="kofi@sevynlabs.io"
          autoComplete="username"
        />
      </div>

      <div>
        <div className="adm-login-lb">
          <label htmlFor="pw">Password</label>
          <a href="#" onClick={(e) => e.preventDefault()}>
            Forgot it?
          </a>
        </div>
        <input
          id="pw"
          className="adm-login-input adm-login-input--error"
          type="password"
          defaultValue="••••••••••"
          autoComplete="current-password"
          aria-invalid="true"
        />
      </div>

      <label className="adm-login-keep">
        <input type="checkbox" /> Keep me signed in on this device for 14 days
      </label>

      <button type="submit" className="adm-login-submit">
        Sign in
      </button>

      <div className="adm-login-divider" aria-hidden="true">
        or
      </div>

      <button
        type="button"
        className="adm-login-alt"
        onClick={() => setLinkSent(true)}
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
        Email me a sign-in link
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
