"use client";

import { useActionState, useState } from "react";
import { FlaskConical } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/format";
import {
  validateDiscountCode,
  type ValidateDiscountState,
} from "@/lib/discounts/actions";

/**
 * "Test a code" tool: runs a code through `apply_discount_validation` and
 * shows either the computed savings or the distinct failure reason
 * (expired / limit-reached / min-order-not-met / paused / scheduled /
 * invalid).
 */
export function ValidateCodeDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ValidateDiscountState, FormData>(
    validateDiscountCode,
    { ok: false },
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FlaskConical className="size-4" />
          Test a code
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Test a discount code</DialogTitle>
          <DialogDescription>
            Validate a code exactly as checkout would — schedule, limits, and
            minimum order are all checked.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="test-code">Code</Label>
            <Input
              id="test-code"
              name="code"
              placeholder="WELCOME10"
              className="font-mono uppercase"
              autoComplete="off"
            />
            {state.fieldErrors?.code ? (
              <p className="text-sm text-destructive">{state.fieldErrors.code[0]}</p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="test-subtotal">Order subtotal</Label>
              <Input
                id="test-subtotal"
                name="subtotal"
                type="number"
                min={0}
                step="0.01"
                defaultValue="100"
              />
              {state.fieldErrors?.subtotal ? (
                <p className="text-sm text-destructive">{state.fieldErrors.subtotal[0]}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="test-customer">Customer ID (optional)</Label>
              <Input
                id="test-customer"
                name="customer_id"
                placeholder="uuid"
                autoComplete="off"
              />
              {state.fieldErrors?.customer_id ? (
                <p className="text-sm text-destructive">{state.fieldErrors.customer_id[0]}</p>
              ) : null}
            </div>
          </div>

          {state.ok && state.result ? (
            <div
              role="status"
              className="rounded-lg border border-emerald-600/30 bg-emerald-600/10 p-4"
            >
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                Valid — {state.result.code} applies
              </p>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Discount</dt>
                  <dd className="font-medium tabular-nums">
                    −{formatMoney(state.result.discount_amount)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">New subtotal</dt>
                  <dd className="font-medium tabular-nums">
                    {formatMoney(state.result.new_subtotal)}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}

          {!state.ok && state.reason ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-4"
            >
              <p className="text-sm font-semibold text-destructive">
                Rejected — {state.reason}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{state.message}</p>
            </div>
          ) : null}

          {!state.ok && !state.reason && state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Validating…" : "Validate"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
