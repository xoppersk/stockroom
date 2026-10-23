import Link from "next/link";
import { Suspense } from "react";

import { SHOP_NAME } from "@/lib/config";
import LoginForm from "./LoginForm";
import "@/styles/console-admin.css";

/* searchParams is runtime data under Cache Components — read in an async
   child behind Suspense. */
async function LoginFormWithParams({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const params = await searchParams;
  return <LoginForm denied={params.denied === "1"} />;
}

/* A-04 · /admin/login — staff sign-in (Login.html). Lives OUTSIDE the
   (shell) group: no AppBar. Black "Staff only." panel on the left, the
   real sign-in form and a one-line footer on the right. `?denied=1` is
   set by the (shell) gate when a signed-in account has no staff role. */
export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  return (
    <div className="adm-login-wrap">
      <aside className="adm-login-aside">
        <span className="adm-login-brand">
          <span aria-hidden="true" className="adm-login-tile">
            L&amp;L
          </span>
          <span className="adm-login-wordmark">STOCKROOM</span>
        </span>
        <div className="adm-login-hero-block">
          <span className="adm-login-hero">
            Staff
            <br />
            only<span className="adm-login-hero-dot">.</span>
          </span>
          <p className="adm-login-lede">
            Orders, stock and money for the shop. Sign in with the email your
            store owner invited.
          </p>
        </div>
        <div aria-hidden="true" className="adm-login-stripe" />
      </aside>

      <main className="adm-login-main">
        <Suspense fallback={null}>
          <LoginFormWithParams searchParams={searchParams} />
        </Suspense>
        <footer className="adm-login-foot">
          <span>Stockroom for {SHOP_NAME}</span>
          <nav aria-label="Help">
            <a href="#">Privacy</a>
            <a href="#">Status</a>
            <Link href="/">Go to the shop</Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}
