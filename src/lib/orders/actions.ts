"use server";

import { revalidatePath } from "next/cache";

import { writeAuditEntry, writeNotification } from "@/lib/audit";
import { requireRole } from "@/lib/auth/roles";
import { fromCents, toCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";

import {
  AddNoteSchema,
  BulkFulfillSchema,
  CancelOrderSchema,
  FulfillOrderSchema,
  NewOrderSchema,
  RefundOrderSchema,
  ValidateDiscountSchema,
} from "./schemas";
import { fetchOrdersForExport, type OrderExportRow, type OrderListFilters } from "./filters";

export type { OrderExportRow };

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
type OrderItemRow = Database["public"]["Tables"]["order_items"]["Row"];

export type ActionResult<T extends Record<string, unknown> = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

function zodError(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

function revalidateOrder(orderNumber: string) {
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderNumber}`);
  revalidatePath("/dashboard");
}

async function insertOrderEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    orderId: string;
    eventType: Database["public"]["Tables"]["order_events"]["Insert"]["event_type"];
    message: string;
    createdBy: string | null;
  },
) {
  const { error } = await supabase.from("order_events").insert({
    order_id: params.orderId,
    event_type: params.eventType,
    message: params.message,
    created_by: params.createdBy,
  });
  if (error) throw new Error(`Couldn't write the timeline entry: ${error.message}`);
}

async function fetchOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string,
): Promise<OrderRow | null> {
  const { data, error } = await supabase.from("orders").select("*").eq("id", orderId).single();
  if (error) return null;
  return data;
}

/* ------------------------------------------------------------------ */
/* Fulfill                                                             */
/* ------------------------------------------------------------------ */

/**
 * Mark a paid order fulfilled, optionally with a tracking number.
 * Roles: admin, warehouse. (Support cannot touch fulfillment.)
 */
export async function fulfillOrder(input: {
  orderId: string;
  trackingNumber?: string;
}): Promise<ActionResult> {
  const { user } = await requireRole(["admin", "warehouse"], "/orders");
  const parsed = FulfillOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };

  const supabase = await createClient();
  const order = await fetchOrder(supabase, parsed.data.orderId);
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status !== "paid") {
    return { ok: false, error: `Only paid orders can be fulfilled — this one is ${order.status}.` };
  }

  const tracking = parsed.data.trackingNumber?.trim() || null;
  const { error: updateError } = await supabase
    .from("orders")
    .update({ status: "fulfilled", tracking_number: tracking })
    .eq("id", order.id);
  if (updateError) return { ok: false, error: updateError.message };

  try {
    await insertOrderEvent(supabase, {
      orderId: order.id,
      eventType: "fulfilled",
      message: tracking
        ? `Order ${order.order_number} marked fulfilled — tracking ${tracking}.`
        : `Order ${order.order_number} marked fulfilled.`,
      createdBy: user.id,
    });
    if (tracking) {
      await insertOrderEvent(supabase, {
        orderId: order.id,
        eventType: "tracking_added",
        message: `Tracking number ${tracking} added to ${order.order_number}.`,
        createdBy: user.id,
      });
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Timeline write failed." };
  }

  await writeAuditEntry({
    actorId: user.id,
    action: "order.fulfill",
    tableName: "orders",
    rowId: order.id,
    before: { status: order.status, tracking_number: order.tracking_number },
    after: { status: "fulfilled", tracking_number: tracking },
  });

  revalidateOrder(order.order_number);
  return { ok: true };
}

/**
 * Bulk-fulfill paid orders from the list page. Orders that aren't paid are
 * skipped (not failed) so a mixed selection still makes progress.
 * Roles: admin, warehouse.
 */
export async function bulkFulfillOrders(input: {
  orderIds: string[];
}): Promise<ActionResult<{ fulfilled: number; skipped: number }>> {
  const { user } = await requireRole(["admin", "warehouse"], "/orders");
  const parsed = BulkFulfillSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };

  const supabase = await createClient();
  let fulfilled = 0;
  let skipped = 0;

  for (const orderId of parsed.data.orderIds) {
    const order = await fetchOrder(supabase, orderId);
    if (!order || order.status !== "paid") {
      skipped += 1;
      continue;
    }
    const { error } = await supabase
      .from("orders")
      .update({ status: "fulfilled" })
      .eq("id", order.id);
    if (error) {
      skipped += 1;
      continue;
    }
    try {
      await insertOrderEvent(supabase, {
        orderId: order.id,
        eventType: "fulfilled",
        message: `Order ${order.order_number} marked fulfilled (bulk).`,
        createdBy: user.id,
      });
    } catch {
      // The status change already landed; the timeline entry is best-effort here.
    }
    await writeAuditEntry({
      actorId: user.id,
      action: "order.fulfill",
      tableName: "orders",
      rowId: order.id,
      before: { status: order.status },
      after: { status: "fulfilled" },
    });
    fulfilled += 1;
  }

  revalidatePath("/orders");
  revalidatePath("/dashboard");
  return { ok: true, fulfilled, skipped };
}

/* ------------------------------------------------------------------ */
/* Refund                                                              */
/* ------------------------------------------------------------------ */

/**
 * Full or partial refund with a required reason. Roles: admin, support —
 * warehouse is denied here (and the UI hides the control).
 *
 * Schema note: the money-guard trigger on `orders` lets only admins change
 * money columns directly; the migration promises a SECURITY DEFINER staff
 * refund function that does not exist yet. Admins refund end-to-end. A
 * support caller passes this action's role check, but Postgres rejects the
 * money change — that rejection is surfaced verbatim below instead of being
 * papered over.
 */
export async function refundOrder(input: {
  orderId: string;
  amount: number;
  reason: string;
}): Promise<ActionResult> {
  const { user, role } = await requireRole(["admin", "support"], "/orders");
  const parsed = RefundOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };

  const supabase = await createClient();
  const order = await fetchOrder(supabase, parsed.data.orderId);
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status !== "paid" && order.status !== "fulfilled" && order.payment_status !== "partially_refunded") {
    return {
      ok: false,
      error: `Only paid orders can be refunded — this one is ${order.status}.`,
    };
  }

  const totalCents = toCents(order.total);
  const alreadyRefundedCents = toCents(order.refunded_total);
  const amountCents = Math.round(parsed.data.amount * 100);
  const remainingCents = totalCents - alreadyRefundedCents;
  if (amountCents > remainingCents) {
    return {
      ok: false,
      error: `Only $${(remainingCents / 100).toFixed(2)} is refundable on this order.`,
    };
  }

  const newRefundedCents = alreadyRefundedCents + amountCents;
  const isFull = newRefundedCents >= totalCents;
  const update = {
    refunded_total: fromCents(newRefundedCents),
    payment_status: isFull ? "refunded" : "partially_refunded",
    ...(isFull ? { status: "refunded" as const } : {}),
  };

  const { error: updateError } = await supabase.from("orders").update(update).eq("id", order.id);
  if (updateError) {
    if (updateError.message.includes("Only admins can change order money columns")) {
      return {
        ok: false,
        error:
          "Support refunds need the staff refund database function (promised by migration " +
          "00008_orders.sql but not yet created). Ask an admin to complete this refund — " +
          "your role check passed, the database guard rejected the money change.",
      };
    }
    return { ok: false, error: updateError.message };
  }

  const amountLabel = `$${(amountCents / 100).toFixed(2)}`;
  try {
    await insertOrderEvent(supabase, {
      orderId: order.id,
      eventType: "refund_issued",
      message: isFull
        ? `Order ${order.order_number} refunded in full (${amountLabel}). Reason: ${parsed.data.reason}`
        : `Partial refund of ${amountLabel} on ${order.order_number}. Reason: ${parsed.data.reason}`,
      createdBy: user.id,
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Timeline write failed." };
  }

  await writeNotification({
    kind: "refund_issued",
    title: `Refund issued: ${order.order_number}`,
    body: `${amountLabel} refunded by ${role} — ${parsed.data.reason}`,
    link: `/orders/${order.order_number}`,
  });
  await writeAuditEntry({
    actorId: user.id,
    action: "order.refund",
    tableName: "orders",
    rowId: order.id,
    before: { refunded_total: order.refunded_total, payment_status: order.payment_status },
    after: { refunded_total: update.refunded_total, payment_status: update.payment_status },
  });

  revalidateOrder(order.order_number);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Cancel (unpaid only)                                                */
/* ------------------------------------------------------------------ */

/**
 * Cancel an unpaid (pending) order and restore its stock. Roles: admin, support.
 *
 * Stock is restored through the internal `_adjust_inventory` worker with
 * reason 'cancelled_order'. That worker deliberately skips the role check —
 * the migration comment assigns authorization to the caller, and this
 * action is the caller (requireRole above). The public `adjust_inventory`
 * RPC only admits admin/warehouse, which would wrongly block support from
 * cancelling.
 */
export async function cancelOrder(input: {
  orderId: string;
  reason?: string;
}): Promise<ActionResult<{ message?: string }>> {
  const { user } = await requireRole(["admin", "support"], "/orders");
  const parsed = CancelOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };

  const supabase = await createClient();
  const order = await fetchOrder(supabase, parsed.data.orderId);
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status !== "pending") {
    return {
      ok: false,
      error:
        order.status === "paid" || order.status === "fulfilled"
          ? "This order is already paid — issue a refund instead of cancelling."
          : `Only pending orders can be cancelled — this one is ${order.status}.`,
    };
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", order.id);
  if (updateError) return { ok: false, error: updateError.message };

  const { data: items } = await supabase
    .from("order_items")
    .select("variant_id, quantity, sku")
    .eq("order_id", order.id);
  const lines: Pick<OrderItemRow, "variant_id" | "quantity" | "sku">[] = items ?? [];

  let restockFailures = 0;
  for (const line of lines) {
    if (!line.variant_id) continue; // variant was deleted after ordering — nothing to restore
    const { error } = await supabase.rpc("_adjust_inventory", {
      p_variant_id: line.variant_id,
      p_delta: line.quantity,
      p_reason: "cancelled_order",
      p_reference: order.order_number,
      p_note: "Cancelled order — stock restored.",
    });
    if (error) restockFailures += 1;
  }

  try {
    await insertOrderEvent(supabase, {
      orderId: order.id,
      eventType: "cancelled",
      message: parsed.data.reason
        ? `Order ${order.order_number} cancelled. Reason: ${parsed.data.reason}`
        : `Order ${order.order_number} cancelled (was unpaid) — stock restored.`,
      createdBy: user.id,
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Timeline write failed." };
  }

  await writeNotification({
    kind: "order_cancelled",
    title: `Order cancelled: ${order.order_number}`,
    body: "Unpaid order cancelled — stock restored.",
    link: `/orders/${order.order_number}`,
  });
  await writeAuditEntry({
    actorId: user.id,
    action: "order.cancel",
    tableName: "orders",
    rowId: order.id,
    before: { status: order.status },
    after: { status: "cancelled" },
  });

  revalidateOrder(order.order_number);
  return {
    ok: true,
    ...(restockFailures > 0
      ? {
          message: `Cancelled, but ${restockFailures} line${restockFailures === 1 ? "" : "s"} failed to restock — check inventory.`,
        }
      : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Note                                                                */
/* ------------------------------------------------------------------ */

/** Append a staff note to the order timeline. Any staff role. */
export async function addOrderNote(input: {
  orderId: string;
  note: string;
}): Promise<ActionResult> {
  const { user } = await requireRole(["admin", "warehouse", "support"], "/orders");
  const parsed = AddNoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };

  const supabase = await createClient();
  const order = await fetchOrder(supabase, parsed.data.orderId);
  if (!order) return { ok: false, error: "Order not found." };

  try {
    await insertOrderEvent(supabase, {
      orderId: order.id,
      eventType: "note_added",
      message: parsed.data.note,
      createdBy: user.id,
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't save the note." };
  }

  await writeAuditEntry({
    actorId: user.id,
    action: "order.note",
    tableName: "orders",
    rowId: order.id,
    after: { note: parsed.data.note },
  });

  revalidatePath(`/orders/${order.order_number}`);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Create (manual order flow)                                          */
/* ------------------------------------------------------------------ */

/**
 * Staff-created order. Roles: admin, support.
 *
 * All stock movement happens inside the `create_order_with_items` RPC: it
 * prices lines from live variants, validates the discount server-side,
 * decrements stock transactionally (raising on insufficient stock), and
 * writes the timeline row, notification, and audit entry itself.
 */
export async function createOrder(input: {
  customerId: string;
  items: { variantId: string; quantity: number }[];
  discountCode?: string;
  shippingAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    region?: string;
    postal_code?: string;
    country?: string;
  };
  note?: string;
}): Promise<ActionResult<{ orderId: string; orderNumber: string }>> {
  await requireRole(["admin", "support"], "/orders/new");
  const parsed = NewOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };

  const supabase = await createClient();
  const pItems: Json = parsed.data.items.map((item) => ({
    variant_id: item.variantId,
    quantity: item.quantity,
  }));

  const address = parsed.data.shippingAddress;
  const pShippingAddress: Json | null =
    address && address.line1 ? { ...address, country: address.country ?? "US" } : null;

  const { data: orderId, error } = await supabase.rpc("create_order_with_items", {
    p_customer_id: parsed.data.customerId,
    p_items: pItems,
    p_discount_code: parsed.data.discountCode?.trim() ? parsed.data.discountCode.trim() : null,
    p_shipping_address: pShippingAddress,
    p_source: "manual",
    p_note: parsed.data.note?.trim() ? parsed.data.note.trim() : null,
  });

  if (error || !orderId) {
    return { ok: false, error: error?.message ?? "The order couldn't be created." };
  }

  const { data: order } = await supabase
    .from("orders")
    .select("order_number")
    .eq("id", orderId)
    .single();

  revalidatePath("/orders");
  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  return { ok: true, orderId, orderNumber: order?.order_number ?? orderId };
}

/* ------------------------------------------------------------------ */
/* Discount live-validation                                            */
/* ------------------------------------------------------------------ */

export type ValidatedDiscount = {
  code: string;
  kind: "percentage" | "fixed";
  value: number;
};

/**
 * Validate a discount code against the live cart subtotal. The RPC raises
 * with a specific message per failure mode (not found / paused / scheduled /
 * expired / usage limit / per-customer limit / min order) — surfaced verbatim.
 * Any staff role may validate; only admin/support reach the order form.
 */
export async function validateDiscountCode(input: {
  code: string;
  subtotal: number;
  customerId?: string;
}): Promise<ActionResult<{ discount: ValidatedDiscount }>> {
  await requireRole(["admin", "warehouse", "support"], "/orders/new");
  const parsed = ValidateDiscountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_discount_validation", {
    p_code: parsed.data.code,
    p_subtotal: parsed.data.subtotal,
    p_customer_id: parsed.data.customerId ?? null,
  });

  if (error) return { ok: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, error: "That code didn't validate — try again." };

  return {
    ok: true,
    discount: { code: row.code, kind: row.kind, value: Number(row.value) },
  };
}

/* ------------------------------------------------------------------ */
/* CSV export                                                          */
/* ------------------------------------------------------------------ */

/**
 * Filtered order rows for CSV export (capped at 2000). Any staff role —
 * export carries the same rows the list page shows.
 */
export async function getOrdersForExport(filters: OrderListFilters): Promise<OrderExportRow[]> {
  await requireRole(["admin", "warehouse", "support"], "/orders");
  const supabase = await createClient();
  return fetchOrdersForExport(supabase, filters);
}
