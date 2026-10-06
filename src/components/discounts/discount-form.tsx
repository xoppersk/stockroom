"use client";

import { useActionState, useMemo, useState } from "react";
import { Dices } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDiscount } from "@/lib/discounts/actions";
import { deriveDiscountStatus } from "@/lib/discounts/status";
import { formatDiscountValue, formatMoney } from "@/lib/format";
import type { ActionState } from "@/lib/server-action";
import { cn } from "@/lib/utils";

function toDateTimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function randomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `SAVE-${suffix}`;
}

/**
 * Discount builder (admin only): code, kind/value, limits, min order, date
 * window, scope, initial paused state — with a live preview of the discount
 * math and the derived status the code will carry.
 */
export function DiscountForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createDiscount,
    { ok: false },
  );

  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percentage" | "fixed">("percentage");
  const [value, setValue] = useState("10");
  const [startsAt, setStartsAt] = useState(() => toDateTimeLocal(new Date()));
  const [endsAt, setEndsAt] = useState("");
  const [startPaused, setStartPaused] = useState(false);
  const [sampleSubtotal, setSampleSubtotal] = useState("120");
  // Captured once at mount so the live preview can fall back to "now" when
  // the starts-at input is cleared without calling Date.now() during render.
  const [mountedAtIso] = useState(() => new Date().toISOString());

  const err = (name: string) => state.fieldErrors?.[name]?.[0];

  const preview = useMemo(() => {
    const v = Number(value);
    const subtotal = Number(sampleSubtotal);
    const validValue = !Number.isNaN(v) && v > 0;
    const validSubtotal = !Number.isNaN(subtotal) && subtotal >= 0;
    const savings =
      validValue && validSubtotal
        ? kind === "percentage"
          ? Math.min(subtotal, (subtotal * v) / 100)
          : Math.min(subtotal, v)
        : 0;
    const status = deriveDiscountStatus(
      {
        status: startPaused ? "paused" : "active",
        starts_at: new Date(startsAt || mountedAtIso).toISOString(),
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        usage_limit: null,
      },
      0,
    );
    return { savings, status, validValue };
  }, [kind, value, sampleSubtotal, startsAt, endsAt, startPaused, mountedAtIso]);

  const fieldClass = (name: string) =>
    cn(err(name) && "border-destructive");

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <form action={formAction} className="space-y-6" noValidate>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Code</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="code">Discount code</Label>
            <div className="flex gap-2">
              <Input
                id="code"
                name="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="WELCOME10"
                className={cn("font-mono uppercase", fieldClass("code"))}
                autoComplete="off"
                maxLength={24}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setCode(randomCode())}
                title="Suggest a code"
              >
                <Dices className="size-4" />
                <span className="sr-only sm:not-sr-only sm:ml-1">Suggest</span>
              </Button>
            </div>
            {err("code") ? (
              <p className="text-sm text-destructive">{err("code")}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Stored uppercase. Letters, numbers, dashes, underscores.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Value</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="kind">Type</Label>
              <select
                id="kind"
                name="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as "percentage" | "fixed")}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="percentage">Percentage %</option>
                <option value="fixed">Fixed amount $</option>
              </select>
              {err("kind") ? (
                <p className="text-sm text-destructive">{err("kind")}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="value">
                {kind === "percentage" ? "Percent off" : "Amount off (USD)"}
              </Label>
              <Input
                id="value"
                name="value"
                type="number"
                min={0.01}
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className={fieldClass("value")}
              />
              {err("value") ? (
                <p className="text-sm text-destructive">{err("value")}</p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Limits</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="usage_limit">Total uses</Label>
              <Input
                id="usage_limit"
                name="usage_limit"
                type="number"
                min={1}
                step={1}
                placeholder="Unlimited"
                className={fieldClass("usage_limit")}
              />
              {err("usage_limit") ? (
                <p className="text-sm text-destructive">{err("usage_limit")}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="per_customer_limit">Uses per customer</Label>
              <Input
                id="per_customer_limit"
                name="per_customer_limit"
                type="number"
                min={1}
                step={1}
                placeholder="Unlimited"
                className={fieldClass("per_customer_limit")}
              />
              {err("per_customer_limit") ? (
                <p className="text-sm text-destructive">{err("per_customer_limit")}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="min_order_value">Minimum order (USD)</Label>
              <Input
                id="min_order_value"
                name="min_order_value"
                type="number"
                min={0}
                step="0.01"
                defaultValue="0"
                className={fieldClass("min_order_value")}
              />
              {err("min_order_value") ? (
                <p className="text-sm text-destructive">{err("min_order_value")}</p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Schedule & scope</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="starts_at">Starts</Label>
              <Input
                id="starts_at"
                name="starts_at"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className={fieldClass("starts_at")}
              />
              {err("starts_at") ? (
                <p className="text-sm text-destructive">{err("starts_at")}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ends_at">Ends (optional)</Label>
              <Input
                id="ends_at"
                name="ends_at"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className={fieldClass("ends_at")}
              />
              {err("ends_at") ? (
                <p className="text-sm text-destructive">{err("ends_at")}</p>
              ) : null}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="scope">Applies to</Label>
              <select
                id="scope"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                defaultValue="entire_order"
              >
                <option value="entire_order">Entire order</option>
                <option value="category" disabled>
                  Specific category (not in v1 schema)
                </option>
              </select>
              <p className="text-xs text-muted-foreground">
                The v1 schema has no per-category scope — every code applies to
                the entire order.
              </p>
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                id="start_paused"
                name="start_paused"
                checked={startPaused}
                onChange={(e) => setStartPaused(e.target.checked)}
                className="size-4 accent-[#d97706]"
              />
              <Label htmlFor="start_paused">Create paused (not redeemable yet)</Label>
            </div>
          </CardContent>
        </Card>

        {state.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" disabled={pending} size="lg">
          {pending ? "Creating…" : "Create discount"}
        </Button>
      </form>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Live preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-dashed bg-muted/50 p-4 text-center">
              <p className="font-mono text-xl font-bold tracking-widest">
                {code || "YOURCODE"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {preview.validValue
                  ? formatDiscountValue(kind, Number(value))
                  : "Enter a value"}
              </p>
              <p className="mt-2 inline-block rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">
                {preview.status}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="preview-subtotal">Try it on a subtotal</Label>
              <Input
                id="preview-subtotal"
                type="number"
                min={0}
                step="0.01"
                value={sampleSubtotal}
                onChange={(e) => setSampleSubtotal(e.target.value)}
              />
            </div>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums">{formatMoney(Number(sampleSubtotal) || 0)}</dd>
              </div>
              <div className="flex justify-between font-medium">
                <dt>Customer saves</dt>
                <dd className="tabular-nums text-emerald-700 dark:text-emerald-400">
                  −{formatMoney(preview.savings)}
                </dd>
              </div>
              <div className="flex justify-between border-t pt-1.5">
                <dt className="text-muted-foreground">New subtotal</dt>
                <dd className="font-semibold tabular-nums">
                  {formatMoney((Number(sampleSubtotal) || 0) - preview.savings)}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              Preview only — checkout re-validates the code server-side through
              apply_discount_validation.
            </p>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
