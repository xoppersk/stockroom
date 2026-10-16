"use client";
/* Adapter over the shop store (@/lib/store). SR-02 fix: the previous
   version read cart/skus/hold off the store OBJECT (which carries only
   methods) and never subscribed, so the cart rendered empty forever.
   This version reads reactive state via useShopState() — cart lines,
   live SKU availability and the checkout hold all come from the one
   store (§10) — and mutates via useShop() methods. Display fields for a
   cart line (name, variant, price, photo) come from ./data's
   CART_DISPLAY, keyed by SKU. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useShop, useShopState } from "@/lib/store";
import { listSkus } from "@/lib/api";
import { CART_DISPLAY, DEMO_CART } from "./data";

export type CartLine = {
  sku: string; slug: string; name: string; variant: string;
  qty: number; priceCents: number; photoBg: string; photoLabel: string; dark: boolean;
};

function lineFor(sku: string, qty: number): CartLine | null {
  const d = CART_DISPLAY[sku];
  if (!d) return null;
  return { sku, qty, ...d };
}

export function useShopCart() {
  const shop = useShop();
  const state = useShopState();

  const lines: CartLine[] = useMemo(
    () =>
      state.cart
        .map((ci) => lineFor(ci.sku, ci.qty))
        .filter((l): l is CartLine => !!l),
    [state.cart],
  );
  const count = lines.reduce((n, l) => n + l.qty, 0);

  const addToCart = useCallback(
    (line: Omit<CartLine, "photoBg" | "photoLabel" | "dark"> & Partial<CartLine>) => {
      shop.addToCart(line.sku, line.qty ?? 1);
    },
    [shop],
  );
  const setQty = useCallback(
    (sku: string, qty: number) => shop.setCartQty(sku, qty),
    [shop],
  );
  const removeFromCart = useCallback(
    (sku: string) => shop.removeFromCart(sku),
    [shop],
  );

  /* Live availability from the same stock truth as the console (§10):
     available = on shelf − committed, read off the store's products. */
  const skus = useMemo(() => listSkus(state.products), [state.products]);
  const available = useCallback(
    (sku: string) => {
      const s = skus.find((x) => x.sku === sku);
      return s ? s.onShelf - s.committed : undefined;
    },
    [skus],
  );

  /* Checkout hold (S-05/X-07): the store's 15-minute hold, started on
     demand via startCheckout(). Stored as an ISO instant on the shop
     clock, which tracks real elapsed time. */
  const holdExpiresAt: number | null = state.checkoutHoldExpiresAt
    ? Date.parse(state.checkoutHoldExpiresAt)
    : null;
  const startHold = useCallback(() => {
    shop.startCheckout();
  }, [shop]);

  /* The drawn S-04 composition (apron + napkins) is in the cart — the
     Terracotta mug notice belongs to that state. */
  const demoSeeded = DEMO_CART.every((d) => lines.some((l) => l.sku === d.sku));
  const markTouched = useCallback(() => {
    /* Kept for call-site compatibility; the store's seeded cart made the
       old sessionStorage seed/touch dance unnecessary. */
  }, []);
  const cartNotice: string | null = null;

  return { lines, count, addToCart, setQty, removeFromCart, available, holdExpiresAt, startHold, demoSeeded, markTouched, cartNotice };
}

/** Ticking "now" (1s) for the live hold countdown. Initial 0 is
 *  prerender-safe; the effect sets the real clock on mount. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => 0);
  useEffect(() => {
    setNow(Date.now());
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}
