"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

import type { ActionResult } from "@/lib/orders/actions";

/**
 * Inventory adjustments (Phase 5). Every stock move goes through the
 * `adjust_inventory` RPC — the migration gives `inventory_levels` no direct
 * UPDATE policy on purpose, so this is the only path. The RPC validates the
 * move (no negative stock), appends the adjustment row, fires a low-stock
 * notification when the level crosses below threshold, and writes audit_log.
 *
 * Roles: admin, warehouse. Support is denied here (the RPC re-checks too).
 */

const ADJUST_REASONS = [
  "restock_received",
  "damaged",
  "recount",
  "return",
  "manual",
] as const;

export const AdjustStockSchema = z.object({
  variantId: z.string().uuid("That doesn't look like a valid variant."),
  delta: z
    .number({ error: "Enter a quantity change." })
    .int("Use a whole number.")
    .refine((d) => d !== 0, "The change can't be zero — nothing would happen.")
    .refine((d) => Math.abs(d) <= 100_000, "That change is implausibly large."),
  reason: z.enum(ADJUST_REASONS, { error: "Pick a reason — every adjustment needs one." }),
  reference: z.string().trim().max(80, "Keep the reference under 80 characters.").optional(),
  note: z.string().trim().max(500, "Keep the note under 500 characters.").optional(),
});
export type AdjustStockInput = z.infer<typeof AdjustStockSchema>;

export const ADJUST_REASON_LABELS: Record<(typeof ADJUST_REASONS)[number], string> = {
  restock_received: "Restock received",
  damaged: "Damaged / lost",
  recount: "Recount correction",
  return: "Customer return",
  manual: "Manual correction",
};

export async function adjustStock(input: {
  variantId: string;
  delta: number;
  reason: (typeof ADJUST_REASONS)[number];
  reference?: string;
  note?: string;
}): Promise<ActionResult<{ newQuantity: number }>> {
  // Role gate: the RPC re-checks too, and records auth.uid() as the actor.
  await requireRole(["admin", "warehouse"], "/inventory");
  const parsed = AdjustStockSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const supabase = await createClient();
  const { data: newQuantity, error } = await supabase.rpc("adjust_inventory", {
    p_variant_id: parsed.data.variantId,
    p_delta: parsed.data.delta,
    p_reason: parsed.data.reason,
    p_reference: parsed.data.reference?.trim() ? parsed.data.reference.trim() : null,
    p_note: parsed.data.note?.trim() ? parsed.data.note.trim() : null,
  });

  if (error || typeof newQuantity !== "number") {
    return { ok: false, error: error?.message ?? "The adjustment didn't go through." };
  }

  // The RPC already wrote inventory_adjustments, the low-stock notification
  // (when crossing below threshold), and the audit_log entry.
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return { ok: true, newQuantity };
}
