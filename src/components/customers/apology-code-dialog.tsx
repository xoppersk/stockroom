"use client";

import { useActionState, useState } from "react";
import { Check, Copy, TicketPercent } from "lucide-react";

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
import { issueApologyCode, type ApologyCodeState } from "@/lib/discounts/actions";

/**
 * "Issue apology code" shortcut (PRD user story 6): support and admin can
 * issue a one-time percentage code from the customer screen. The server
 * action enforces the guardrails (percentage, single use, per-customer).
 */
export function ApologyCodeDialog({
  customerId,
  customerName,
}: {
  customerId: string;
  customerName: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [state, formAction, pending] = useActionState<ApologyCodeState, FormData>(
    issueApologyCode,
    { ok: false },
  );

  async function copyCode() {
    if (!state.code) return;
    try {
      await navigator.clipboard.writeText(state.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the code is still visible */
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setCopied(false);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <TicketPercent className="size-4" />
          Issue apology code
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Issue apology code</DialogTitle>
          <DialogDescription>
            A one-time {state.code ? "" : "percentage "}code for {customerName} —
            single use, valid 14 days.
          </DialogDescription>
        </DialogHeader>

        {state.ok && state.code ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-dashed bg-muted/50 p-4 text-center">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Code issued
              </p>
              <p className="mt-1 font-mono text-2xl font-bold tracking-widest">
                {state.code}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Single use · expires in 14 days
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={copyCode}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy code"}
              </Button>
              <Button type="button" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="customer_id" value={customerId} />
            <div className="space-y-2">
              <Label htmlFor="apology-percent">Discount percent</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="apology-percent"
                  name="percent"
                  type="number"
                  min={1}
                  max={50}
                  defaultValue={15}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">% off, one time</span>
              </div>
              {state.fieldErrors?.percent ? (
                <p className="text-sm text-destructive">{state.fieldErrors.percent[0]}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Standard is 15%. Codes are single-use and expire after 14 days.
              </p>
            </div>
            {state.error ? (
              <p role="alert" className="text-sm text-destructive">
                {state.error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Issuing…" : "Issue code"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
