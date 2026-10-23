"use client";
/**
 * Storefront cart hook — REAL cart state from /api/cart (carts/cart_items
 * in Supabase, guest-token cookie or signed-in user), replacing the old
 * fixture store adapter. The fixture store (@/lib/store) now drives only
 * console state and pure UI state elsewhere; it is NOT consulted here.
 *
 * The hook is self-contained: it fetches the cart on mount, keeps it in
 * React state, and every mutation goes through the API routes and adopts
 * the server-returned cart (prices always come from the server).
 * `window` event `stockroom:cart-changed` keeps multiple hook instances
 * (header badge lives in chrome.tsx, owned by W-AUTH) roughly in sync.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface CartLine {
  itemId: string;
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  variant: string;
  sku: string;
  qty: number;
  priceCents: number;
  lineTotalCents: number;
  imageUrl: string | null;
  available: number | null;
  photoBg: string;
  photoLabel: string;
  dark: boolean;
}

interface ApiCartLine {
  itemId: string;
  variantId: string;
  productId: string;
  productSlug: string;
  productTitle: string;
  variantTitle: string;
  sku: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  imageUrl: string | null;
  available: number | null;
}

interface ApiCart {
  cartId: string;
  lines: ApiCartLine[];
  itemCount: number;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  discountCode: string | null;
}

const PALETTE = ["#3A3530", "#D9D0C1", "#9A4E2E", "#ECE9E3", "#6B7F6A", "#C9B79A", "#8C5A3C", "#E8D5A8", "#A57B4F", "#57534E"];
function placeholderBg(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}
function isDark(hex: string): boolean {
  const c = hex.replace("#", "");
  const lum = 0.2126 * parseInt(c.slice(0, 2), 16) + 0.7152 * parseInt(c.slice(2, 4), 16) + 0.0722 * parseInt(c.slice(4, 6), 16);
  return lum < 140;
}

function toLine(l: ApiCartLine): CartLine {
  const bg = placeholderBg(l.productSlug);
  return {
    itemId: l.itemId,
    variantId: l.variantId,
    productId: l.productId,
    slug: l.productSlug,
    name: l.productTitle,
    variant: l.variantTitle,
    sku: l.sku,
    qty: l.quantity,
    priceCents: l.unitPriceCents,
    lineTotalCents: l.lineTotalCents,
    imageUrl: l.imageUrl,
    available: l.available,
    photoBg: bg,
    photoLabel: `Photo placeholder: ${l.productTitle.toLowerCase()}`,
    dark: isDark(bg),
  };
}

const CART_EVENT = "stockroom:cart-changed";

export function useShopCart() {
  const [cart, setCart] = useState<ApiCart | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/cart", { cache: "no-store" });
      const json = (await res.json()) as { cart: ApiCart | null };
      if (!aliveRef.current) return;
      setCart(json.cart);
    } catch {
      if (aliveRef.current) setCart(null);
    } finally {
      if (aliveRef.current) setLoaded(true);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    // Initial load from the cart API (external system); state updates land
    // after the fetch resolves, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(CART_EVENT, onChange);
    return () => {
      aliveRef.current = false;
      window.removeEventListener(CART_EVENT, onChange);
    };
  }, [refresh]);

  const broadcast = useCallback(() => {
    window.dispatchEvent(new Event(CART_EVENT));
  }, []);

  const mutate = useCallback(
    async (fn: () => Promise<Response>): Promise<{ ok: boolean; error?: string }> => {
      setBusy(true);
      setError(null);
      try {
        const res = await fn();
        const json = (await res.json().catch(() => ({}))) as { cart?: ApiCart; error?: string };
        if (!res.ok) {
          setError(json.error ?? "Something went wrong. Please try again.");
          return { ok: false, error: json.error };
        }
        if (json.cart) setCart(json.cart);
        broadcast();
        return { ok: true };
      } catch {
        setError("Something went wrong. Please try again.");
        return { ok: false, error: "network" };
      } finally {
        if (aliveRef.current) setBusy(false);
      }
    },
    [broadcast],
  );

  const addToCart = useCallback(
    async (variantId: string, qty = 1) =>
      mutate(() =>
        fetch("/api/cart/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ variantId, quantity: qty }),
        }),
      ),
    [mutate],
  );

  const setQty = useCallback(
    async (itemId: string, qty: number) =>
      mutate(() =>
        fetch(`/api/cart/items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: qty }),
        }),
      ),
    [mutate],
  );

  const removeFromCart = useCallback(
    async (itemId: string) =>
      mutate(() => fetch(`/api/cart/items/${itemId}`, { method: "DELETE" })),
    [mutate],
  );

  const applyDiscount = useCallback(
    async (code: string) =>
      mutate(() =>
        fetch("/api/cart/discount", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        }),
      ),
    [mutate],
  );

  const removeDiscount = useCallback(
    async () => mutate(() => fetch("/api/cart/discount", { method: "DELETE" })),
    [mutate],
  );

  const lines: CartLine[] = useMemo(() => (cart?.lines ?? []).map(toLine), [cart]);
  const count = cart?.itemCount ?? 0;

  return {
    cart,
    lines,
    count,
    loaded,
    busy,
    error,
    subtotalCents: cart?.subtotalCents ?? 0,
    discountCents: cart?.discountCents ?? 0,
    totalCents: cart?.totalCents ?? 0,
    discountCode: cart?.discountCode ?? null,
    addToCart,
    setQty,
    removeFromCart,
    applyDiscount,
    removeDiscount,
    refresh,
  };
}

/** Ticking "now" (1s). Initial 0 is prerender-safe. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => 0);
  useEffect(() => {
    // Clock sync on mount (pattern carried over from the original hook).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}
