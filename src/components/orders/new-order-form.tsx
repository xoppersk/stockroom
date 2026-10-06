"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Search, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createOrder, validateDiscountCode, type ValidatedDiscount } from "@/lib/orders/actions";
import { formatMoney } from "@/lib/money";
import { discountFor, taxFor, taxLabel } from "@/lib/orders/tax";
import { cn } from "@/lib/utils";

export type CustomerOption = { id: string; name: string; email: string };
export type VariantOption = {
  id: string;
  sku: string;
  title: string;
  productTitle: string;
  priceCents: number;
  stock: number;
};

type Line = { variantId: string; quantity: number };

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums", strong && "text-base font-semibold")}>{value}</span>
    </div>
  );
}

/**
 * Manual order flow (admin/support): pick a customer, add variants, apply a
 * discount code (validated live against the RPC), review totals, submit.
 * Stock decrements happen transactionally inside `create_order_with_items`.
 */
export function NewOrderForm({
  customers,
  variants,
}: {
  customers: CustomerOption[];
  variants: VariantOption[];
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [variantQuery, setVariantQuery] = useState("");
  const [code, setCode] = useState("");
  const [discount, setDiscount] = useState<ValidatedDiscount | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);
  const [address, setAddress] = useState({ line1: "", line2: "", city: "", region: "", postal_code: "", country: "US" });
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPlacing, startPlacing] = useTransition();

  const variantById = useMemo(() => new Map(variants.map((v) => [v.id, v])), [variants]);
  const customer = customers.find((c) => c.id === customerId) ?? null;

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [customers, customerQuery]);

  const filteredVariants = useMemo(() => {
    const q = variantQuery.trim().toLowerCase();
    const pool = q
      ? variants.filter(
          (v) =>
            v.sku.toLowerCase().includes(q) ||
            v.title.toLowerCase().includes(q) ||
            v.productTitle.toLowerCase().includes(q),
        )
      : variants;
    return pool.slice(0, 12);
  }, [variants, variantQuery]);

  const subtotalCents = lines.reduce(
    (sum, line) => sum + (variantById.get(line.variantId)?.priceCents ?? 0) * line.quantity,
    0,
  );
  const discountCents = discountFor(subtotalCents, discount);
  const taxableCents = subtotalCents - discountCents;
  const taxCents = taxFor(taxableCents);
  const chargedCents = taxableCents; // what the RPC stores (tax-exclusive until settings rate ships)
  const stockProblems = lines.filter(
    (line) => line.quantity > (variantById.get(line.variantId)?.stock ?? 0),
  );

  function addVariant(id: string) {
    setLines((prev) => {
      const existing = prev.find((l) => l.variantId === id);
      if (existing) {
        return prev.map((l) => (l.variantId === id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { variantId: id, quantity: 1 }];
    });
  }

  function setQty(variantId: string, quantity: number) {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.variantId !== variantId)
        : prev.map((l) => (l.variantId === variantId ? { ...l, quantity } : l)),
    );
  }

  async function applyCode() {
    const trimmed = code.trim();
    if (!trimmed || subtotalCents <= 0) return;
    setCheckingCode(true);
    setDiscountError(null);
    const result = await validateDiscountCode({
      code: trimmed,
      subtotal: subtotalCents / 100,
      customerId: customerId || undefined,
    });
    setCheckingCode(false);
    if (!result.ok) {
      setDiscount(null);
      setDiscountError(result.error);
      return;
    }
    setDiscount(result.discount);
  }

  function placeOrder() {
    setError(null);
    if (!customerId) {
      setError("Pick a customer first.");
      return;
    }
    if (lines.length === 0) {
      setError("Add at least one line item.");
      return;
    }
    if (stockProblems.length > 0) {
      setError("Some lines exceed available stock — lower the quantities.");
      return;
    }
    startPlacing(async () => {
      const result = await createOrder({
        customerId,
        items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        discountCode: discount ? code.trim() : undefined,
        shippingAddress: address.line1.trim() ? { ...address } : undefined,
        note: note.trim() ? note.trim() : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/orders/${result.orderNumber}`);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-6">
        {/* Customer */}
        <section className="rounded-lg border bg-card p-4 md:p-5">
          <h2 className="mb-3 text-base font-semibold tracking-tight">Customer</h2>
          <div className="relative">
            <Label htmlFor="customer-search" className="sr-only">Search customers</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="customer-search"
                value={customer ? `${customer.name} — ${customer.email}` : customerQuery}
                onChange={(e) => {
                  setCustomerQuery(e.target.value);
                  setCustomerOpen(true);
                  if (customer) {
                    setCustomerId("");
                    setCustomerQuery(e.target.value);
                  }
                }}
                onFocus={() => setCustomerOpen(true)}
                placeholder="Search by name or email…"
                className="min-h-11 pl-9"
                autoComplete="off"
              />
              {customer && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                  onClick={() => {
                    setCustomerId("");
                    setCustomerQuery("");
                  }}
                  aria-label="Clear customer"
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>
            {customerOpen && !customer && (
              <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-card shadow-lg">
                {filteredCustomers.length === 0 && (
                  <li className="px-4 py-3 text-sm text-muted-foreground">No customers match.</li>
                )}
                {filteredCustomers.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="flex min-h-11 w-full flex-col items-start justify-center px-4 py-2 text-left hover:bg-muted"
                      onClick={() => {
                        setCustomerId(c.id);
                        setCustomerOpen(false);
                        setCustomerQuery("");
                        setDiscount(null);
                        setDiscountError(null);
                      }}
                    >
                      <span className="text-sm font-medium">{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Variants */}
        <section className="rounded-lg border bg-card p-4 md:p-5">
          <h2 className="mb-3 text-base font-semibold tracking-tight">Line items</h2>
          <div className="relative mb-3">
            <Label htmlFor="variant-search" className="sr-only">Search variants</Label>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="variant-search"
              value={variantQuery}
              onChange={(e) => setVariantQuery(e.target.value)}
              placeholder="Search SKU, variant, or product…"
              className="min-h-11 pl-9"
              autoComplete="off"
            />
          </div>
          <ul className="mb-4 flex max-h-64 flex-col gap-1 overflow-auto rounded-lg border p-1">
            {filteredVariants.map((v) => (
              <li key={v.id} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {v.productTitle} <span className="font-normal text-muted-foreground">· {v.title}</span>
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {v.sku} · {formatMoney(v.priceCents / 100)} · {v.stock} in stock
                  </div>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => addVariant(v.id)} className="min-h-11 shrink-0">
                  Add
                </Button>
              </li>
            ))}
            {filteredVariants.length === 0 && (
              <li className="px-3 py-4 text-sm text-muted-foreground">No variants match.</li>
            )}
          </ul>

          {lines.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No line items yet — search above and add variants.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {lines.map((line) => {
                const v = variantById.get(line.variantId);
                if (!v) return null;
                const over = line.quantity > v.stock;
                return (
                  <li
                    key={line.variantId}
                    className={cn("flex items-center gap-3 rounded-lg border p-3", over && "border-[#DC2626]/40")}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {v.productTitle} <span className="font-normal text-muted-foreground">· {v.title}</span>
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {v.sku} · {formatMoney(v.priceCents / 100)} each
                        {over && <span className="text-[#DC2626]"> · only {v.stock} in stock</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="outline" size="icon" className="size-11" onClick={() => setQty(line.variantId, line.quantity - 1)} aria-label="Decrease quantity">
                        <Minus className="size-4" />
                      </Button>
                      <span className="w-10 text-center text-sm font-medium tabular-nums">{line.quantity}</span>
                      <Button type="button" variant="outline" size="icon" className="size-11" onClick={() => setQty(line.variantId, line.quantity + 1)} aria-label="Increase quantity">
                        <Plus className="size-4" />
                      </Button>
                    </div>
                    <div className="w-20 text-right text-sm font-medium tabular-nums">
                      {formatMoney((v.priceCents * line.quantity) / 100)}
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="size-11" onClick={() => setQty(line.variantId, 0)} aria-label={`Remove ${v.sku}`}>
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Discount */}
        <section className="rounded-lg border bg-card p-4 md:p-5">
          <h2 className="mb-3 text-base font-semibold tracking-tight">Discount</h2>
          {discount ? (
            <div className="flex items-center justify-between rounded-lg border border-[#15803D]/25 bg-[#15803D]/10 px-4 py-3">
              <span className="text-sm font-medium text-[#15803D]">
                {discount.code} — {discount.kind === "percentage" ? `${discount.value}% off` : `${formatMoney(discount.value)} off`}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setDiscount(null); setCode(""); }} className="min-h-11">
                Remove
              </Button>
            </div>
          ) : (
            <div>
              <div className="flex gap-2">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="CODE"
                  className="min-h-11 uppercase tabular-nums"
                  aria-label="Discount code"
                />
                <Button type="button" variant="outline" onClick={applyCode} disabled={checkingCode || !code.trim() || subtotalCents <= 0} className="min-h-11 shrink-0">
                  {checkingCode ? "Checking…" : "Apply"}
                </Button>
              </div>
              {discountError && (
                <p className="mt-2 text-sm text-[#DC2626]" role="alert">{discountError}</p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Validated live — expired, paused, over-limit, and below-minimum codes are rejected with the reason.
              </p>
            </div>
          )}
        </section>

        {/* Shipping + note */}
        <section className="rounded-lg border bg-card p-4 md:p-5">
          <h2 className="mb-3 text-base font-semibold tracking-tight">Shipping & note</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="addr-line1">Street address</Label>
              <Input id="addr-line1" value={address.line1} onChange={(e) => setAddress({ ...address, line1: e.target.value })} className="mt-1.5 min-h-11" autoComplete="off" />
            </div>
            <div>
              <Label htmlFor="addr-city">City</Label>
              <Input id="addr-city" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} className="mt-1.5 min-h-11" autoComplete="off" />
            </div>
            <div>
              <Label htmlFor="addr-region">State / region</Label>
              <Input id="addr-region" value={address.region} onChange={(e) => setAddress({ ...address, region: e.target.value })} className="mt-1.5 min-h-11" autoComplete="off" />
            </div>
            <div>
              <Label htmlFor="addr-postal">Postal code</Label>
              <Input id="addr-postal" value={address.postal_code} onChange={(e) => setAddress({ ...address, postal_code: e.target.value })} className="mt-1.5 min-h-11" autoComplete="off" />
            </div>
            <div>
              <Label htmlFor="addr-country">Country</Label>
              <Input id="addr-country" value={address.country} onChange={(e) => setAddress({ ...address, country: e.target.value })} className="mt-1.5 min-h-11" autoComplete="off" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="order-note">Note (optional)</Label>
              <Textarea id="order-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1.5" placeholder="Goes on the order timeline…" />
            </div>
          </div>
        </section>
      </div>

      {/* Summary */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 md:p-5">
          <h2 className="text-base font-semibold tracking-tight">Order summary</h2>
          <SummaryRow label="Subtotal" value={formatMoney(subtotalCents / 100)} />
          {discount && (
            <SummaryRow label={`Discount (${discount.code})`} value={`−${formatMoney(discountCents / 100)}`} />
          )}
          <SummaryRow label={taxLabel()} value={formatMoney(taxCents / 100)} />
          <div className="border-t pt-3">
            <SummaryRow label="Charged total" value={formatMoney(chargedCents / 100)} strong />
          </div>
          <p className="text-xs text-muted-foreground">
            Tax is an estimate until the settings tax rate ships — the stored order is tax-exclusive.
          </p>
          {error && (
            <p className="rounded-lg border border-[#DC2626]/25 bg-[#DC2626]/10 px-3 py-2 text-sm text-[#DC2626]" role="alert">
              {error}
            </p>
          )}
          <Button onClick={placeOrder} disabled={isPlacing} className="min-h-12 w-full">
            {isPlacing ? "Creating…" : `Create order · ${formatMoney(chargedCents / 100)}`}
          </Button>
        </div>
      </aside>
    </div>
  );
}
