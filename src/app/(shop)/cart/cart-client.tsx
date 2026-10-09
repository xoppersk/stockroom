"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Minus, Plus, Tag, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  applyDiscountCode,
  removeDiscountCode,
  removeItem,
  updateItemQty,
  type CartDetails,
} from "@/lib/cart/cart";
import { formatUSD, shimmerPlaceholder } from "@/lib/shop/format";

interface CheckoutState {
  pending: boolean;
  error: string | null;
}

/** Interactive cart: qty steppers, remove, discount code, order summary, checkout. */
export function CartClient({ initial }: { initial: CartDetails }) {
  const router = useRouter();
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeMessage, setCodeMessage] = useState<string | null>(initial.discountMessage);
  const [codeOk, setCodeOk] = useState(initial.discountMessage === null && initial.discountCode !== null);
  const [codePending, setCodePending] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutState>({ pending: false, error: null });

  const { lines, subtotal, discountCode, discountTotal } = initial;
  const total = Math.max(0, subtotal - discountTotal);

  async function runItem(itemId: string, fn: () => Promise<{ ok: boolean; message: string }>) {
    setBusyItem(itemId);
    try {
      const result = await fn();
      if (!result.ok) {
        setCheckout({ pending: false, error: result.message });
      } else {
        router.refresh();
      }
    } finally {
      setBusyItem(null);
    }
  }

  async function handleApplyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || codePending) return;
    setCodePending(true);
    setCodeMessage(null);
    try {
      const result = await applyDiscountCode(code);
      setCodeMessage(result.message);
      setCodeOk(result.ok);
      if (result.ok) {
        setCode("");
        router.refresh();
      }
    } finally {
      setCodePending(false);
    }
  }

  async function handleRemoveCode() {
    setCodePending(true);
    try {
      await removeDiscountCode();
      setCodeMessage(null);
      setCodeOk(false);
      router.refresh();
    } finally {
      setCodePending(false);
    }
  }

  async function handleCheckout() {
    if (checkout.pending) return;
    setCheckout({ pending: true, error: null });
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      const data = (await res.json()) as {
        url?: string;
        demoOrderId?: string;
        error?: string;
      };
      if (!res.ok) {
        setCheckout({ pending: false, error: data.error ?? "Checkout failed. Please try again." });
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (data.demoOrderId) {
        router.push(`/checkout/success?order=${data.demoOrderId}`);
        return;
      }
      setCheckout({ pending: false, error: "Checkout failed. Please try again." });
    } catch {
      setCheckout({ pending: false, error: "Checkout failed. Please try again." });
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
      {/* Lines */}
      <div className="space-y-4">
        {lines.map((line) => {
          const busy = busyItem === line.itemId;
          const lowStock = line.stockOnHand > 0 && line.stockOnHand <= line.lowStockThreshold;
          return (
            <div
              key={line.itemId}
              className="flex gap-4 rounded-[var(--radius)] border border-border bg-card p-4"
            >
              <Link
                href={`/shop/${line.productSlug}`}
                className="relative h-24 w-20 shrink-0 overflow-hidden rounded-md bg-muted"
                aria-label={line.productTitle}
              >
                {line.imageUrl ? (
                  <Image
                    src={line.imageUrl}
                    alt={line.imageAlt}
                    fill
                    sizes="80px"
                    className="object-cover"
                    placeholder="blur"
                    blurDataURL={shimmerPlaceholder(160, 200)}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
                    {line.productTitle}
                  </div>
                )}
              </Link>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/shop/${line.productSlug}`}
                      className="font-medium tracking-tight hover:underline"
                    >
                      {line.productTitle}
                    </Link>
                    <p className="mt-0.5 text-sm text-muted-foreground">{line.variantTitle}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => runItem(line.itemId, () => removeItem(line.itemId))}
                    disabled={busy}
                    aria-label={`Remove ${line.productTitle}`}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-40"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
                {lowStock && (
                  <p className="mt-1 text-xs font-medium text-[var(--warning)]">
                    Only {line.stockOnHand} left
                  </p>
                )}
                {line.stockOnHand === 0 && (
                  <p className="mt-1 text-xs font-medium text-destructive">Out of stock</p>
                )}
                <div className="mt-auto flex items-center justify-between pt-3">
                  <div className="flex items-center rounded-md border border-border">
                    <button
                      type="button"
                      onClick={() => runItem(line.itemId, () => updateItemQty(line.itemId, line.quantity - 1))}
                      disabled={busy || line.quantity <= 1}
                      aria-label="Decrease quantity"
                      className="flex min-h-11 min-w-11 items-center justify-center disabled:opacity-40"
                    >
                      <Minus className="size-4" aria-hidden />
                    </button>
                    <span className="w-8 text-center text-sm font-medium tabular-nums" aria-live="polite">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => runItem(line.itemId, () => updateItemQty(line.itemId, line.quantity + 1))}
                      disabled={busy || line.quantity >= Math.min(99, line.stockOnHand)}
                      aria-label="Increase quantity"
                      className="flex min-h-11 min-w-11 items-center justify-center disabled:opacity-40"
                    >
                      <Plus className="size-4" aria-hidden />
                    </button>
                  </div>
                  <div className="text-right">
                    {line.compareAtPrice !== null && Number(line.compareAtPrice) > Number(line.unitPrice) && (
                      <p className="text-xs text-muted-foreground line-through tabular-nums">
                        {formatUSD(Number(line.compareAtPrice) * line.quantity)}
                      </p>
                    )}
                    <p className="font-semibold tabular-nums">
                      {formatUSD(Number(line.unitPrice) * line.quantity)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-[var(--radius)] border border-border bg-card p-6">
          <h2 className="font-semibold tracking-tight">Order summary</h2>

          {/* Discount code */}
          <div className="mt-4">
            {discountCode ? (
              <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
                <span className="inline-flex items-center gap-2 text-sm font-medium">
                  <Tag className="size-4 text-primary" aria-hidden />
                  {discountCode}
                </span>
                <button
                  type="button"
                  onClick={handleRemoveCode}
                  disabled={codePending}
                  aria-label="Remove discount code"
                  className="flex min-h-9 min-w-9 items-center justify-center rounded-md text-muted-foreground hover:text-destructive disabled:opacity-40"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ) : (
              <form onSubmit={handleApplyCode} className="flex gap-2">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Discount code"
                  aria-label="Discount code"
                  autoComplete="off"
                  className="uppercase"
                />
                <Button type="submit" variant="outline" disabled={codePending || !code.trim()}>
                  {codePending ? "Checking…" : "Apply"}
                </Button>
              </form>
            )}
            {codeMessage && (
              <p
                role={codeOk ? "status" : "alert"}
                className={`mt-2 text-sm ${codeOk ? "text-[var(--success)]" : "text-destructive"}`}
              >
                {codeMessage}
              </p>
            )}
          </div>

          <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="font-medium tabular-nums">{formatUSD(subtotal)}</dd>
            </div>
            {discountTotal > 0 && discountCode && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Discount ({discountCode})</dt>
                <dd className="font-medium text-[var(--success)] tabular-nums">
                  −{formatUSD(discountTotal)}
                </dd>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-2 text-base">
              <dt className="font-semibold">Total</dt>
              <dd className="font-semibold tabular-nums">{formatUSD(total)}</dd>
            </div>
          </dl>

          <Button
            className="mt-6 w-full"
            size="lg"
            disabled={checkout.pending || lines.length === 0}
            onClick={handleCheckout}
          >
            {checkout.pending ? "Starting checkout…" : `Pay ${formatUSD(total)}`}
          </Button>
          {checkout.error && (
            <p role="alert" className="mt-3 text-sm font-medium text-destructive">
              {checkout.error}
            </p>
          )}
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Secure checkout. Totals are confirmed before you pay.
          </p>
        </div>
      </div>

      {/* Mobile sticky checkout bar (Flagship UI Designs §2.18) */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-4 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-lg font-semibold tabular-nums">{formatUSD(total)}</p>
          </div>
          <Button
            size="lg"
            className="flex-1"
            disabled={checkout.pending || lines.length === 0}
            onClick={handleCheckout}
          >
            {checkout.pending ? "Starting checkout…" : `Pay ${formatUSD(total)}`}
          </Button>
        </div>
        {checkout.error && (
          <p role="alert" className="mx-auto mt-2 max-w-6xl text-sm font-medium text-destructive">
            {checkout.error}
          </p>
        )}
      </div>
    </div>
  );
}
