"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addOrderNote, cancelOrder, fulfillOrder, refundOrder } from "@/lib/orders/actions";
import { formatMoney, toCents } from "@/lib/money";

type Role = "admin" | "warehouse" | "support";

function ActionError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-lg border border-[#DC2626]/25 bg-[#DC2626]/10 px-3 py-2 text-sm text-[#DC2626]" role="alert">
      {message}
    </p>
  );
}

/**
 * Contextual actions on the order detail page. Visibility is the first gate
 * (warehouse never sees refund; support never sees fulfill); every action
 * re-checks the role server-side.
 */
export function OrderActions({
  orderId,
  orderNumber,
  status,
  paymentStatus,
  total,
  refundedTotal,
  role,
  defaultAction,
}: {
  orderId: string;
  orderNumber: string;
  status: string;
  total: string;
  refundedTotal: string;
  paymentStatus: string;
  role: Role;
  /** e.g. "refund" — deep-links from the list open the matching dialog. */
  defaultAction?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fulfillOpen, setFulfillOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(defaultAction === "refund");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [tracking, setTracking] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canFulfill = (role === "admin" || role === "warehouse") && status === "paid";
  const refundable =
    (role === "admin" || role === "support") &&
    (status === "paid" || status === "fulfilled" || paymentStatus === "partially_refunded");
  const remainingCents = toCents(total) - toCents(refundedTotal);
  const canCancel = (role === "admin" || role === "support") && status === "pending";

  function run(action: () => Promise<{ ok: boolean; error?: string; message?: string }>, close: () => void) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      if (result.message) setNotice(result.message);
      close();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {notice && (
        <p className="rounded-lg border bg-muted px-3 py-2 text-sm" role="status">
          {notice}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {canFulfill && (
          <Dialog open={fulfillOpen} onOpenChange={setFulfillOpen}>
            <DialogTrigger asChild>
              <Button className="min-h-11">Mark fulfilled</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Fulfill {orderNumber}</DialogTitle>
                <DialogDescription>
                  The order moves to Fulfilled. Add the carrier tracking number if you have it.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Label htmlFor="tracking">Tracking number (optional)</Label>
                <Input
                  id="tracking"
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                  placeholder="1Z 999 AA1 01 2345 6784"
                  className="min-h-11"
                />
              </div>
              <ActionError message={error} />
              <DialogFooter>
                <Button variant="outline" onClick={() => setFulfillOpen(false)} className="min-h-11">
                  Back
                </Button>
                <Button
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => fulfillOrder({ orderId, trackingNumber: tracking || undefined }),
                      () => {
                        setFulfillOpen(false);
                        setTracking("");
                      },
                    )
                  }
                  className="min-h-11"
                >
                  {pending ? "Saving…" : "Mark fulfilled"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {refundable && remainingCents > 0 && (
          <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="min-h-11">
                Refund
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Refund {orderNumber}</DialogTitle>
                <DialogDescription>
                  {formatMoney(refundedTotal)} already refunded · {formatMoney(remainingCents / 100)}{" "}
                  still refundable. A reason is required — it goes on the timeline.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="refund-amount">Amount (USD)</Label>
                  <Input
                    id="refund-amount"
                    inputMode="decimal"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    placeholder={(remainingCents / 100).toFixed(2)}
                    className="min-h-11 tabular-nums"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="refund-reason">Reason</Label>
                  <Textarea
                    id="refund-reason"
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    placeholder="e.g. Customer received a damaged item"
                    rows={3}
                  />
                </div>
              </div>
              <ActionError message={error} />
              <DialogFooter>
                <Button variant="outline" onClick={() => setRefundOpen(false)} className="min-h-11">
                  Back
                </Button>
                <Button
                  disabled={pending}
                  onClick={() =>
                    run(
                      () =>
                        refundOrder({
                          orderId,
                          amount: Number(refundAmount),
                          reason: refundReason,
                        }),
                      () => {
                        setRefundOpen(false);
                        setRefundAmount("");
                        setRefundReason("");
                      },
                    )
                  }
                  className="min-h-11"
                >
                  {pending ? "Issuing…" : "Issue refund"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {canCancel && (
          <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="min-h-11">
                Cancel order
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cancel {orderNumber}?</DialogTitle>
                <DialogDescription>
                  This order is unpaid, so cancelling restores its stock. This can&apos;t be undone.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Label htmlFor="cancel-reason">Reason (optional)</Label>
                <Textarea
                  id="cancel-reason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Customer asked to cancel before payment"
                  rows={3}
                />
              </div>
              <ActionError message={error} />
              <DialogFooter>
                <Button variant="outline" onClick={() => setCancelOpen(false)} className="min-h-11">
                  Keep order
                </Button>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => cancelOrder({ orderId, reason: cancelReason || undefined }),
                      () => {
                        setCancelOpen(false);
                        setCancelReason("");
                      },
                    )
                  }
                  className="min-h-11"
                >
                  {pending ? "Cancelling…" : "Cancel order"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Staff note */}
      <form
        className="flex flex-col gap-2 rounded-lg border bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!note.trim()) return;
          run(() => addOrderNote({ orderId, note: note.trim() }), () => setNote(""));
        }}
      >
        <Label htmlFor="order-note" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Add a note
        </Label>
        <Textarea
          id="order-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Visible to staff on the timeline…"
          rows={2}
        />
        <div className="flex justify-end">
          <Button type="submit" variant="secondary" disabled={pending || !note.trim()} className="min-h-11">
            {pending ? "Saving…" : "Add note"}
          </Button>
        </div>
      </form>
      <ActionError message={error} />
    </div>
  );
}
