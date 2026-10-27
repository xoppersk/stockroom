"use client";
/* Storefront chrome: announcement bar + wordmark header (full nav with LIVE
   cart count), slim transactional headers, and StoreFooter in "full" /
   "slim" variants (HANDOVER §6, screens S-01…S-06/X-07). */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SHOP_NAME, SHOP_ADDRESS } from "@/lib/config";
import { useShopCart } from "./use-shop";
import { ArrowLeft } from "./ui";

const UPPER_NAME = SHOP_NAME.toUpperCase();

export function Wordmark({ small = false }: { small?: boolean }) {
  return (
    <Link href="/" className={`wordmark${small ? " sm" : ""}`} style={small ? { color: "#fff" } : undefined}>
      <span aria-hidden="true" className="tile">L&amp;L</span>
      {UPPER_NAME}
    </Link>
  );
}

function SearchIcon() {
  return (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>);
}
function AccountIcon() {
  return (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="8" cy="5.5" r="2.8" /><path d="M2.5 14c.8-2.8 3-4.2 5.5-4.2s4.7 1.4 5.5 4.2" /></svg>);
}
function CartIcon() {
  return (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5.5h10l-.8 8.5H3.8z" /><path d="M5.5 5.5V4.5a2.5 2.5 0 0 1 5 0v1" /></svg>);
}

export function StoreHeader({ accountNav }: { accountNav?: React.ReactNode }) {
  const pathname = usePathname();
  const { count } = useShopCart();
  const onCollection = pathname?.startsWith("/collections/");
  return (
    <>
      <div className="announce">
        Order by <b className="mono">2:00 PM Eastern</b> and it ships today from our Philadelphia workshop.
      </div>
      <header className="sheader">
        <div className="swrap sheader-in">
          <Wordmark />
          <nav aria-label="Shop" className="shopnav">
            <Link href="/collections/kitchen-dining" className="nl" aria-current={onCollection ? "page" : undefined}>Kitchen &amp; Dining</Link>
            <Link href="/collections/home-textiles" className="nl">Home Textiles</Link>
            <Link href="/collections/lighting" className="nl">Lighting</Link>
            <Link href="/collections/decor" className="nl">Decor</Link>
            <Link href="/#workshop" className="nl">The workshop</Link>
          </nav>
          <div className="head-actions">
            <a href="#" className="nl"><SearchIcon />Search</a>
            {accountNav ?? (
              <Link href="/account/login" className="nl"><AccountIcon />Sign in</Link>
            )}
            <Link href="/cart" className="nl" aria-label={`Cart (${count})`}><CartIcon />Cart <span className="cnt" aria-hidden="true">{count}</span></Link>
          </div>
        </div>
      </header>
    </>
  );
}

/** Slim header for cart / checkout / confirmation / declined (narrow wrap). */
export function StoreSlimHeader({ right }: { right: React.ReactNode }) {
  return (
    <header className="sheader">
      <div className="swrap n sheader-in">
        <Wordmark />
        {right}
      </div>
    </header>
  );
}

export function KeepShoppingLink() {
  return (<Link href="/collections/kitchen-dining" className="nl"><ArrowLeft />Keep shopping</Link>);
}

/** StoreFooter — "full" (home/collection/product): wordmark, address + pickup
    hours, help links, back-in-stock sign-up with the TAPE button (the one tape
    element on the storefront). "slim" (cart/checkout/confirmation/declined):
    shop name + address, contact email, Shipping and returns / Privacy /
    Terms. The screens draw the slim contact as hello@sevynlabs.io. */
export function StoreFooter({ variant }: { variant: "full" | "slim" }) {
  if (variant === "slim") {
    return (
      <footer className="sfooter-slim">
        <div className="swrap n sfooter-slim-in">
          <span>{SHOP_NAME} · {SHOP_ADDRESS} · questions <span className="mono" style={{ fontSize: 12 }}>10–6</span>, <a href="mailto:hello@sevynlabs.io">hello@sevynlabs.io</a> or <a href="tel:+12762702729">(276) 270-2729</a></span>
          <nav aria-label="Policies">
            <a href="#">Shipping and returns</a><a href="#">Privacy</a><a href="#">Terms</a>
          </nav>
        </div>
      </footer>
    );
  }
  return (
    <footer className="sfooter-full">
      <div className="swrap sfooter-full-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 380 }}>
          <Wordmark small />
          <span style={{ lineHeight: 1.55 }}>2214 Fitzwater St, Philadelphia · pickup <span className="mono" style={{ fontSize: 13, whiteSpace: "nowrap" }}>Tue–Sat 10–6</span></span>
        </div>
        <nav aria-label="Help" className="sfooter-help">
          <a href="#">Shipping and returns</a><a href="#">Care guides</a><a href="#">Wholesale</a>
        </nav>
        <form className="bis-form" action="#" method="get">
          <label htmlFor="bis-email">One email when things are back in stock</label>
          <div className="bis-row">
            <input id="bis-email" type="email" placeholder="you@sevynlabs.io" autoComplete="email" />
            <button type="submit">Sign up</button>
          </div>
        </form>
      </div>
    </footer>
  );
}
