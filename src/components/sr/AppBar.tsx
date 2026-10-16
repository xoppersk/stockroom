"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SHOP_NAME, SHOP_SHORT } from "@/lib/config";
import { inventorySummary, listSkus, ordersSummary } from "@/lib/api";
import { useShopState } from "@/lib/store";

export type AppBarCurrent =
  | "dashboard"
  | "orders"
  | "products"
  | "inventory"
  | "customers"
  | "discounts"
  | "settings";

/** §6/§7 AppBar — client component with LIVE counts (§10: the Orders count
 *  drops when a hold clears). Held orders → Orders tab (tape-filled square);
 *  SKUs below reorder → Inventory tab. Counts derive from the same api
 *  derivations the pages use (ordersSummary / inventorySummary), read from
 *  the live store state so a cleared hold drops the tab count at once.
 *  Navigation uses next/link (SR-01): the one client store must survive
 *  moving around the console — plain anchors full-reloaded the app and
 *  reset every surface to fixture state.
 *  SR-07: the drawn global search ("Order, SKU or customer") sits between
 *  the tabs and the account controls; ⌘K / Ctrl+K (or "/" outside a
 *  field) focuses it, and submitting searches Orders via ?q= (the URL
 *  state §10 prescribes). SR-14: on the X-02/X-05 empty states the drawn
 *  AppBar carries NO count chips — hideCounts.
 *  FIX-2: on the three settings screens (Settings/Team/AuditHistory.html)
 *  the package draws a "Settings" tab in the bar — apart from the main
 *  tabs (§6; DS AppBar README: "Settings sits apart from the main tabs"),
 *  active-styled with aria-current="page", between the nav and the search
 *  field. It renders only when current === "settings"; Main.html and the
 *  other 26 screens draw no such tab (verified against the screens). */
export function AppBar({ current, hideCounts = false }: { current: string; hideCounts?: boolean }) {
  const state = useShopState();
  const router = useRouter();
  const params = useSearchParams();
  const held = ordersSummary(state.orders).heldCount;
  const below = inventorySummary(listSkus(state.products)).belowReorder;

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  useEffect(() => {
    setQuery(params.get("q") ?? "");
  }, [params]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      const kbdShortcut = e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey);
      const slashShortcut = e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey;
      if (kbdShortcut || slashShortcut) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const tabs: { key: AppBarCurrent; label: string; href: string; count?: number; tape?: boolean }[] = [
    { key: "dashboard", label: "Dashboard", href: "/admin" },
    { key: "orders", label: "Orders", href: "/admin/orders", count: held, tape: true },
    { key: "products", label: "Products", href: "/admin/products" },
    { key: "inventory", label: "Inventory", href: "/admin/inventory", count: below },
    { key: "customers", label: "Customers", href: "/admin/customers" },
    { key: "discounts", label: "Discounts", href: "/admin/discounts" },
  ];

  return (
    <header className="bar">
      <Link className="bar-brand" href="/admin" aria-label={`${SHOP_NAME} Stockroom`}>
        <span className="tile" aria-hidden="true">
          {SHOP_SHORT}
        </span>
        <span className="bar-name">{SHOP_NAME}</span>
        {/* FIX-2 geometry: the settings screens draw the brand as tile +
            name only (203px at 1440) — with the "Stockroom" product label
            (254px) the restored Settings tab squeezes the nav 37px short
            and "Storefront ↗" wraps, taking the bar to 136px (measured).
            The settings route group therefore renders the brand exactly
            as its screens draw it; every other page keeps the label. */}
        {current !== "settings" ? <span className="bar-product">Stockroom</span> : null}
      </Link>
      <nav aria-label="Main">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className="tab"
            aria-current={current === t.key ? "page" : undefined}
          >
            {t.label}
            {!hideCounts && t.count != null ? (
              <span className={`cnt${t.tape ? " tape" : ""}`}>{t.count}</span>
            ) : null}
          </Link>
        ))}
        <Link href="/" className="tab">
          Storefront ↗
        </Link>
      </nav>
      {/* FIX-2: the drawn Settings tab — a direct child of the bar after
          the nav, as Settings/Team/AuditHistory.html draw it (the screens'
          inline active style, color #FFFFFF + tape underline, is exactly
          what .tab[aria-current="page"] already computes). Settings
          routes only; no other screen draws it. */}
      {current === "settings" ? (
        <Link href="/admin/settings" className="tab" aria-current="page">
          Settings
        </Link>
      ) : null}
      <form
        role="search"
        className="bar-search"
        onSubmit={(e) => {
          e.preventDefault();
          const q = query.trim();
          /* The AppBar find drives the Orders page's own filter state
             (?q=, §10 URL state) — the same thing the page's search box
             sets. It finds what the Orders page can show: order ids,
             customers and SKUs in its lists. */
          router.push(q ? `/admin/orders?q=${encodeURIComponent(q)}` : "/admin/orders");
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>
        <input
          ref={inputRef}
          aria-label="Find an order, SKU or customer"
          placeholder="Order, SKU or customer"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="bar-search-kbd mono" aria-hidden="true">/</span>
      </form>
      {/* The avatar is the settings link on every screen (aria-label in
          the screens: "Sheku Koroma, owner — settings"); on the settings
          screens the drawn Settings tab above is present as well. */}
      <Link href="/admin/settings" className="avatar" aria-label="Your account — Sheku Koroma">
        SK
      </Link>
    </header>
  );
}
