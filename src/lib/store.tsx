"use client";
/* Client shop store (HANDOVER §10): the stock ledger, order holds, refunds
   with role limits, the cart with its 15-minute checkout hold, and the
   offline action queue. Mutations keep every derived canon number honest
   because api.ts derivations run over the same shapes.
   The store core (createShopStore) is framework-free so it can be unit
   tested; ShopProvider binds it to React. */
import {
  createContext, useContext, useEffect, useRef, useState, useSyncExternalStore,
  type ReactNode,
} from "react";
import productsJson from "@/data/products.json";
import ordersJson from "@/data/orders.json";
import teamJson from "@/data/team.json";
import { listAudit, listPurchaseOrders } from "./api";
import { formatShopTime, shopBaseDate, shopNow } from "./clock";
import type {
  AddToCartResult, AuditEntry, CartItem, ConnectionState, Order, Product,
  RefundResult, RetryResult, TeamMember,
} from "./types";

export interface ShopState {
  products: Product[];
  orders: Order[];
  audit: AuditEntry[];
  cart: CartItem[];
  checkoutHoldExpiresAt: string | null;
  connection: ConnectionState;
  actorId: string;
  receivedPoIds: string[];
}

export interface ShopStore {
  getState: () => ShopState;
  subscribe: (fn: () => void) => () => void;
  getActor: () => TeamMember;
  setActor: (memberId: string) => void;
  adjustStock: (sku: string, delta: number, reason: string, actor?: TeamMember) => AuditEntry | null;
  recordCountAndRelease: (orderId: string, counted: number, actor?: TeamMember) => boolean;
  retryPayment: (orderId: string) => RetryResult;
  attemptRefund: (orderId: string, amountCents: number, actor: TeamMember) => RefundResult;
  receiveDelivery: (poId: string, actor?: TeamMember) => boolean;
  addToCart: (sku: string, qty?: number) => AddToCartResult;
  removeFromCart: (sku: string) => void;
  setCartQty: (sku: string, qty: number) => void;
  clearCart: () => void;
  startCheckout: () => string | null;
  setOnline: (online: boolean) => string[];
  enterOfflineDemo: () => void;
  queueAction: (label: string) => void;
  flushQueue: () => string[];
}

const members = (teamJson as unknown as { members: TeamMember[] }).members;
const TODAY_GROUP = "Today · Tue, Oct 6";

function auditTimeLabel(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

export function initialShopState(): ShopState {
  return {
    products: structuredClone(productsJson.products) as Product[],
    orders: structuredClone(ordersJson.orders) as Order[],
    audit: structuredClone(listAudit().entries),
    /* S-04 drawn state: the demo session opens with the cart the screens
       draw — apron (Charcoal) ×1 + napkins (Natural) ×1, badge "Cart 2",
       $100.00 subtotal. The Terracotta mug is a notice, not a line (it
       sold out while in the cart). */
    cart: [
      { sku: "LA-CHR", qty: 1 },
      { sku: "NP-4N", qty: 1 },
    ],
    checkoutHoldExpiresAt: null,
    connection: { online: true, asOfLabel: formatShopTime(shopBaseDate()), queue: [] },
    actorId: "sheku",
    receivedPoIds: [],
  };
}

export function createShopStore(initial: ShopState = initialShopState()): ShopStore {
  let state = initial;
  let auditSeq = 0;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((fn) => fn());
  const set = (patch: Partial<ShopState>) => { state = { ...state, ...patch }; emit(); };

  const getActor = (): TeamMember =>
    members.find((m) => m.id === state.actorId) ?? members[0]!;

  function prependAudit(partial: Omit<AuditEntry, "id" | "dateISO" | "dayGroup" | "timeLabel">): AuditEntry {
    const now = shopNow();
    const entry: AuditEntry = {
      id: `AU-LOCAL-${++auditSeq}`,
      dateISO: "2026-10-06",
      dayGroup: TODAY_GROUP,
      timeLabel: auditTimeLabel(now),
      ...partial,
    };
    set({ audit: [entry, ...state.audit] });
    return entry;
  }

  function patchVariant(sku: string, fn: (v: Product["variants"][number]) => Product["variants"][number]): boolean {
    let found = false;
    const next = state.products.map((p) => {
      if (!p.variants.some((v) => v.sku === sku)) return p;
      found = true;
      return { ...p, variants: p.variants.map((v) => (v.sku === sku ? fn(v) : v)) };
    });
    if (found) set({ products: next });
    return found;
  }

  function patchOrder(id: string, fn: (o: Order) => Order): Order | undefined {
    const target = state.orders.find((o) => o.id === id);
    if (!target) return undefined;
    set({ orders: state.orders.map((o) => (o.id === id ? fn(o) : o)) });
    return target;
  }

  return {
    getState: () => state,
    subscribe: (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    getActor,
    setActor: (memberId) => { if (members.some((m) => m.id === memberId)) set({ actorId: memberId }); },

    adjustStock: (sku, delta, reason, actor = getActor()) => {
      const product = state.products.find((p) => p.variants.some((v) => v.sku === sku));
      const variant = product?.variants.find((v) => v.sku === sku);
      if (!product || !variant || delta === 0) return null;
      const before = variant.onShelf;
      const after = Math.max(0, before + delta);
      patchVariant(sku, (v) => ({ ...v, onShelf: after }));
      return prependAudit({
        actorId: actor.id, actorName: actor.name, kind: "stock", stampLabel: "Stock",
        text: `Adjusted stock on ${sku} · on shelf ${before} → ${after}. Reason: ${reason}.`,
        moneyCents: delta < 0 && variant.costCents != null ? delta * variant.costCents : null,
        oldValue: String(before), newValue: String(after),
      });
    },

    recordCountAndRelease: (orderId, counted, actor = getActor()) => {
      const order = state.orders.find((o) => o.id === orderId);
      if (!order?.hold || order.hold.kind !== "stock" || !order.hold.sku) return false;
      const sku = order.hold.sku;
      patchVariant(sku, (v) => ({ ...v, onShelf: counted, countPending: false }));
      patchOrder(orderId, (o) => ({ ...o, hold: null, stage: "packing", stageLabel: "Packing" }));
      prependAudit({
        actorId: actor.id, actorName: actor.name, kind: "stock", stampLabel: "Stock",
        text: `Recorded count on ${sku}, shelf ${order.hold.shelf ?? ""} · counted ${counted}. Released ${orderId} to packing.`,
        moneyCents: null, oldValue: null, newValue: null,
      });
      return true;
    },

    retryPayment: (orderId) => {
      const order = state.orders.find((o) => o.id === orderId);
      if (!order) return { ok: false, reason: "not-found" };
      if (order.paymentStatus !== "failed") return { ok: false, reason: "not-failed" };
      const attempts = (order.payment?.attempts ?? 0) + 1;
      const max = order.payment?.maxAttempts ?? 3;
      if (attempts > max) return { ok: false, reason: "max-attempts" };
      if (attempts < 2) {
        patchOrder(orderId, (o) => ({ ...o, payment: { ...o.payment, status: "failed", attempts } }));
        return { ok: false, reason: "declined-again" };
      }
      patchOrder(orderId, (o) => ({
        ...o, hold: null, paymentStatus: "paid", stage: "to-pick", stageLabel: "To pick",
        payment: { ...o.payment, status: "paid", attempts },
      }));
      prependAudit({
        actorId: null, actorName: "System", kind: "money", stampLabel: "Money",
        text: `Payment captured on retry ${attempts} for ${orderId}, ${order.customerName}. Hold cleared.`,
        moneyCents: order.totalCents, oldValue: null, newValue: null,
      });
      return { ok: true };
    },

    attemptRefund: (orderId, amountCents, actor) => {
      /* Role limit first, WITHOUT mutating — the caller keeps its form state
         and shows X-06 (HANDOVER §10). */
      if (actor.refundLimitCents != null && amountCents > actor.refundLimitCents) {
        return { ok: false, reason: "over-limit", limit: actor.refundLimitCents };
      }
      const order = state.orders.find((o) => o.id === orderId);
      if (!order) return { ok: false, reason: "not-found" };
      const refunded = order.refundedCents + amountCents;
      patchOrder(orderId, (o) => ({
        ...o, refundedCents: refunded,
        paymentStatus: refunded >= o.totalCents ? "refunded" : "partially-refunded",
        refundRequest: undefined,
      }));
      prependAudit({
        actorId: actor.id, actorName: actor.name, kind: "money", stampLabel: "Money",
        text: `Refunded ${orderId} · $${(amountCents / 100).toFixed(2)} by ${actor.name}.`,
        moneyCents: -amountCents, oldValue: null, newValue: null,
      });
      return { ok: true };
    },

    receiveDelivery: (poId, actor = getActor()) => {
      if (state.receivedPoIds.includes(poId)) return false;
      const po = listPurchaseOrders().find((p) => p.id === poId);
      if (!po) return false;
      for (const line of po.lines) patchVariant(line.sku, (v) => ({ ...v, onShelf: v.onShelf + line.qty }));
      set({ receivedPoIds: [...state.receivedPoIds, poId] });
      prependAudit({
        actorId: actor.id, actorName: actor.name, kind: "stock", stampLabel: "Received",
        text: `Received ${poId} · ${po.lines.map((l) => `${l.qty} × ${l.sku}`).join(", ")}, all counted`,
        moneyCents: null, oldValue: null, newValue: null,
      });
      return true;
    },

    addToCart: (sku, qty = 1) => {
      const product = state.products.find((p) => p.variants.some((v) => v.sku === sku));
      const variant = product?.variants.find((v) => v.sku === sku);
      if (!product || !variant) return { ok: false, reason: "not-found" };
      const available = variant.onShelf - variant.committed;
      if (available <= 0 && !product.backorder) return { ok: false, reason: "sold-out" };
      const existing = state.cart.find((i) => i.sku === sku);
      set({
        cart: existing
          ? state.cart.map((i) => (i.sku === sku ? { ...i, qty: i.qty + qty } : i))
          : [...state.cart, { sku, qty }],
      });
      return { ok: true };
    },

    removeFromCart: (sku) => set({ cart: state.cart.filter((i) => i.sku !== sku) }),
    setCartQty: (sku, qty) =>
      set({ cart: qty <= 0 ? state.cart.filter((i) => i.sku !== sku) : state.cart.map((i) => (i.sku === sku ? { ...i, qty } : i)) }),
    clearCart: () => set({ cart: [], checkoutHoldExpiresAt: null }),

    startCheckout: () => {
      if (state.cart.length === 0) return null;
      const expires = new Date(shopNow().getTime() + 15 * 60_000).toISOString();
      set({ checkoutHoldExpiresAt: expires });
      return expires;
    },

    setOnline: (online) => {
      if (online) {
        const flushed = [...state.connection.queue];
        set({ connection: { online: true, asOfLabel: formatShopTime(shopNow()), queue: [] } });
        return flushed;
      }
      set({ connection: { online: false, asOfLabel: formatShopTime(shopNow()), queue: state.connection.queue } });
      return [];
    },

    /* X-08 drawn state (SysReconnect.html): the demo disconnect is the one
       the screens draw — data as of 11:42 AM, with the two actions the
       screen shows already waiting to send. Generic setOnline(false)
       keeps the live shop-clock label; this entry is only for ?state=. */
    enterOfflineDemo: () => {
      set({
        connection: {
          online: false,
          asOfLabel: "11:42 AM",
          queue:
            state.connection.queue.length > 0
              ? state.connection.queue
              : ["Note on ORD-1043 · 11:44", "Packing slip print × 3 · 11:45"],
        },
      });
    },

    queueAction: (label) => {
      if (state.connection.online) return;
      set({ connection: { ...state.connection, queue: [...state.connection.queue, label] } });
    },

    flushQueue: () => {
      const flushed = [...state.connection.queue];
      if (flushed.length > 0) set({ connection: { ...state.connection, queue: [] } });
      return flushed;
    },
  };
}

/* ---------------- React binding ---------------- */

const ShopContext = createContext<ShopStore | null>(null);

export function ShopProvider({ children }: { children: ReactNode }) {
  const ref = useRef<ShopStore | null>(null);
  if (!ref.current) ref.current = createShopStore();
  return <ShopContext.Provider value={ref.current}>{children}</ShopContext.Provider>;
}

export function useShop(): ShopStore {
  const store = useContext(ShopContext);
  if (!store) throw new Error("useShop must be used inside <ShopProvider>");
  return store;
}

export function useShopState(): ShopState {
  const store = useShop();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

export function useActor(): TeamMember {
  const store = useShop();
  const state = useShopState();
  void state;
  return store.getActor();
}

/** Shop "now", re-rendering every `intervalMs` (default 30 s). Initial value
 *  is the fixture base instant (prerender-safe); the effect jumps to the
 *  live shop clock on mount. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState<Date>(() => shopBaseDate());
  useEffect(() => {
    setNow(shopNow());
    const t = setInterval(() => setNow(shopNow()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
