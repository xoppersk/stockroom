import { SHOP_NAME } from "@/lib/config";
import LoginForm from "./LoginForm";
import "@/styles/console-admin.css";

/* A-04 · /admin/login — staff sign-in (Login.html). Lives OUTSIDE the
   (shell) group: no AppBar. Black "Staff only." panel on the left, the
   sign-in form (drawn in its error state) and a one-line footer on the
   right. */
export default function LoginPage() {
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
        <LoginForm />
        <footer className="adm-login-foot">
          <span>Stockroom for {SHOP_NAME}</span>
          <nav aria-label="Help">
            <a href="#">Privacy</a>
            <a href="#">Status</a>
            <a href="/">Go to the shop</a>
          </nav>
        </footer>
      </main>
    </div>
  );
}
