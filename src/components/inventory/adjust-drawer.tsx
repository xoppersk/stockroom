"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ADJUST_REASON_LABELS, adjustStock } from "@/lib/inventory/actions";
import { cn } from "@/lib/utils";

import { StockStatusPill } from "@/components/orders/status-pill";

export type InventoryRow = {
  variantId: string;
  sku: string;
  variantTitle: string;
  productTitle: string;
  quantity: number;
  threshold: number;
};

type ReasonKey = keyof typeof ADJUST_REASON_LABELS;

/**
 * Adjust-stock drawer. Delta + required reason + reference, with a live
 * resulting-count preview. Submits through the `adjust_inventory` RPC —
 * never a direct table write.
 */
export function AdjustDrawer({
  row,
  onClose,
}: {
  row: InventoryRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<ReasonKey | "">("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  // The form resets whenever a different variant is opened: the parent
  // renders <AdjustDrawer key={row.variantId}>, so each variant gets a fresh
  // mount with the initial state above. No reset-on-prop-change effect needed.

  const qtyNum = Number(qty);
  const delta = Number.isFinite(qtyNum) && qtyNum > 0 ? (direction === "add" ? Math.floor(qtyNum) : -Math.floor(qtyNum)) : 0;
  const resulting = row ? row.quantity + delta : 0;
  const valid = row !== null && delta !== 0 && resulting >= 0 && reason !== "";

  function submit() {
    if (!row || !valid) return;
    setError(null);
    startSaving(async () => {
      const result = await adjustStock({
        variantId: row.variantId,
        delta,
        reason: reason as ReasonKey,
        reference: reference.trim() ? reference.trim() : undefined,
        note: note.trim() ? note.trim() : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Spec §2.9: toast "+50 Linen Apron — Charcoal (Received shipment)".
      toast.success(
        `${delta > 0 ? "+" : ""}${delta} ${row.productTitle} — ${row.variantTitle} (${ADJUST_REASON_LABELS[reason as ReasonKey]})`,
      );
      onClose();
      router.refresh();
    });
  }

  return (
    <Sheet open={row !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="flex w-full flex-col gap-5 overflow-y-auto sm:max-w-md">
        {row && (
          <>
            <SheetHeader>
              <SheetTitle>Adjust stock</SheetTitle>
              <SheetDescription>
                {row.productTitle} · {row.variantTitle} · <span className="tabular-nums">{row.sku}</span>
              </SheetDescription>
            </SheetHeader>

            <div className="flex items-center justify-between rounded-lg border bg-muted/50 px-4 py-3">
              <span className="text-sm text-muted-foreground">On hand</span>
              <span className="flex items-center gap-2">
                <span className="text-lg font-semibold tabular-nums">{row.quantity}</span>
                <StockStatusPill quantity={row.quantity} threshold={row.threshold} />
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Direction</Label>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Adjustment direction">
                {(["add", "remove"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={direction === d}
                    onClick={() => setDirection(d)}
                    className={cn(
                      "min-h-11 rounded-lg border px-4 text-sm font-medium transition-colors",
                      direction === d
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card hover:border-primary/50",
                    )}
                  >
                    {d === "add" ? "Add stock" : "Remove stock"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="adjust-qty">Quantity</Label>
              <Input
                id="adjust-qty"
                inputMode="numeric"
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="0"
                className="min-h-11 tabular-nums"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="adjust-reason">Reason (required)</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as ReasonKey)}>
                <SelectTrigger id="adjust-reason" className="min-h-11">
                  <SelectValue placeholder="Pick a reason…" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ADJUST_REASON_LABELS) as ReasonKey[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {ADJUST_REASON_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="adjust-ref">Reference (optional)</Label>
              <Input
                id="adjust-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="PO-221, cycle count sheet…"
                className="min-h-11"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="adjust-note">Note (optional)</Label>
              <Textarea
                id="adjust-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything the next person should know…"
                rows={2}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm">
              <span className="text-muted-foreground">Resulting count</span>
              <span className="flex items-center gap-2 font-semibold tabular-nums">
                {row.quantity}
                <ArrowRight className="size-4 text-muted-foreground" />
                <span className={cn(resulting < 0 && "text-[#DC2626]")}>{resulting}</span>
              </span>
            </div>
            {delta !== 0 && resulting < 0 && (
              <p className="text-sm text-[#DC2626]" role="alert">
                Can&apos;t go below zero — only {row.quantity} on hand.
              </p>
            )}

            {error && (
              <p className="rounded-lg border border-[#DC2626]/25 bg-[#DC2626]/10 px-3 py-2 text-sm text-[#DC2626]" role="alert">
                {error}
              </p>
            )}

            <SheetFooter>
              <Button variant="outline" onClick={onClose} className="min-h-11">
                Cancel
              </Button>
              <Button onClick={submit} disabled={!valid || isSaving} className="min-h-11">
                {isSaving ? "Saving…" : "Apply adjustment"}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
