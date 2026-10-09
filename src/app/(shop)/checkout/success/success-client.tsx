"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { confirmDemoPayment } from "@/lib/stripe/demo";
import { formatUSD } from "@/lib/shop/format";

export interface SuccessOrderItem {
  productTitle: string;
  variantTitle: string;
  sku: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface SuccessOrder {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: string;
  discountTotal: string;
  discountCode: string | null;
  total: string;
}

interface SuccessClientProps {
  order: SuccessOrder;
  items: SuccessOrderItem[];
  /** Demo mode (no Stripe keys): this page triggers the simulated payment. */
  isDemo: boolean;
}

const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 45;

/**
 * Confirmation screen. Shows a "confirming payment" state while the order is
 * still `pending` (the Stripe webhook — or the demo-mode simulation — hasn't
 * landed yet), polling the order status until it reaches a terminal state.
 */
export function SuccessClient({ order, items, isDemo }: SuccessClientProps) {
  const [status, setStatus] = useState(order.status);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    let attempts = 0;

    async function poll() {
      attempts += 1;
      try {
        const res = await fetch(`/api/orders/${order.id}/status`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { status: string };
        if (!alive) return;
        setStatus(data.status);
        if (data.status !== "pending" || attempts >= MAX_ATTEMPTS) {
          if (data.status === "pending" && attempts >= MAX_ATTEMPTS) setGaveUp(true);
          if (timer) clearInterval(timer);
        }
      } catch {
        // Network hiccup — keep polling until the attempt budget is spent.
      }
    }

    (async () => {
      if (isDemo && alive) {
        // Simulate the Stripe webhook through the real state machine.
        // Idempotent: a double invocation is a skipped_duplicate no-op.
        await confirmDemoPayment(order.id);
      }
      if (!alive) return;
      await poll();
      if (alive) timer = setInterval(poll, POLL_INTERVAL_MS);
    })();

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [order.id, isDemo]);

  if (status === "pending") {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <Loader2 className="mx-auto size-12 animate-spin text-primary" aria-hidden />
        <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight">Confirming your payment…</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Order <span className="font-medium text-foreground tabular-nums">{order.orderNumber}</span>
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          {gaveUp
            ? "This is taking longer than expected. Your payment may still be processing — check back in a moment."
            : "This usually takes a few seconds. Please don't close this page."}
        </p>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <XCircle className="mx-auto size-12 text-destructive" aria-hidden />
        <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight">Payment didn&apos;t go through</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Order <span className="font-medium text-foreground tabular-nums">{order.orderNumber}</span>{" "}
          was not charged. You can try again from your cart.
        </p>
        <Button asChild className="mt-8">
          <Link href="/cart">Back to cart</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl py-12">
      <div className="text-center">
        <CheckCircle2 className="mx-auto size-14 text-[var(--success)]" aria-hidden />
        <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight">Order confirmed</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Thank you! Your order{" "}
          <span className="font-semibold text-foreground tabular-nums">{order.orderNumber}</span>{" "}
          is confirmed. We&apos;ve emailed your receipt.
        </p>
      </div>

      <div className="mt-10 rounded-[var(--radius)] border border-border bg-card p-6">
        <h2 className="font-semibold tracking-tight">What you ordered</h2>
        <ul className="mt-4 divide-y divide-border">
          {items.map((item) => (
            <li key={`${item.sku}-${item.variantTitle}`} className="flex justify-between gap-4 py-3 text-sm">
              <div>
                <p className="font-medium">{item.productTitle}</p>
                <p className="text-muted-foreground">
                  {item.variantTitle} · Qty {item.quantity}
                </p>
              </div>
              <p className="font-medium tabular-nums">{formatUSD(item.lineTotal)}</p>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular-nums">{formatUSD(order.subtotal)}</dd>
          </div>
          {Number(order.discountTotal) > 0 && order.discountCode && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Discount ({order.discountCode})</dt>
              <dd className="text-[var(--success)] tabular-nums">−{formatUSD(order.discountTotal)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
            <dt>Total paid</dt>
            <dd className="tabular-nums">{formatUSD(order.total)}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-8 text-center">
        <Button asChild>
          <Link href="/shop">Continue shopping</Link>
        </Button>
        <p className="mt-4 text-xs text-muted-foreground">
          Questions about your order? Contact us and we&apos;ll sort it out.
        </p>
      </div>
    </div>
  );
}
