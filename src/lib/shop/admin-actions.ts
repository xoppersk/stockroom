"use server";

/* Admin-console write actions (server actions).
 *
 * Every action uses the request-scoped session client — RLS policies
 * and the SECURITY DEFINER RPCs' own role checks are the authorization;
 * there is no service-role bypass here. Failures return
 * { ok: false, reason } with the database's message so panels can show
 * the real rejection (e.g. warehouse attempting a refund — ruling 6).
 *
 * Identifier flexibility (documented in the W-DATA log): order args
 * accept the order UUID or the order_number; variant args accept the
 * variant UUID or its SKU code; product args accept UUID or slug;
 * discount args accept UUID or code. Page call sites hold different
 * identifiers in different islands; resolving here keeps both honest.
 */
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { ShopDatabase } from "./types";
import { isUuid } from "./admin";

type Client = SupabaseClient<ShopDatabase>;
type Result = { ok: true } | { ok: false; reason: string };

async function db(): Promise<Client> {
  return (await createClient()) as unknown as Client;
}

function fail(error: { message: string } | null, fallback: string): Result {
  return { ok: false, reason: error?.message ?? fallback };
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  return (
    !!error &&
    (error.code === "42P01" ||
      error.code === "PGRST205" ||
      /relation .* does not exist|could not find the table/i.test(error.message ?? ""))
  );
}

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  return (
    !!error &&
    (error.code === "42703" ||
      error.code === "PGRST204" ||
      /column .* does not exist|could not find the .* column/i.test(error.message ?? ""))
  );
}

/* ---------------- resolvers ---------------- */

async function resolveOrderId(client: Client, idOrNumber: string): Promise<string | null> {
  if (isUuid(idOrNumber)) return idOrNumber;
  const { data } = await client
    .from("orders")
    .select("id")
    .eq("order_number", idOrNumber.toUpperCase())
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function resolveVariantId(client: Client, idOrSku: string): Promise<string | null> {
  if (isUuid(idOrSku)) return idOrSku;
  const { data } = await client
    .from("product_variants")
    .select("id")
    .eq("sku", idOrSku)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function resolveProductId(client: Client, idOrSlug: string): Promise<string | null> {
  if (isUuid(idOrSlug)) return idOrSlug;
  const { data } = await client
    .from("products")
    .select("id")
    .eq("slug", idOrSlug)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function resolveDiscountId(client: Client, idOrCode: string): Promise<string | null> {
  if (isUuid(idOrCode)) return idOrCode;
  const { data } = await client
    .from("discounts")
    .select("id")
    .eq("code", idOrCode.toUpperCase())
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function addEvent(
  client: Client,
  orderId: string,
  eventType: string,
  message: string,
): Promise<void> {
  await client.from("order_events").insert({
    order_id: orderId,
    event_type: eventType,
    message,
  });
}

const ORDER_PATHS = ["/admin", "/admin/orders"];
function revalidate(...paths: string[]): void {
  for (const p of paths) revalidatePath(p);
}

/* ---------------- orders ---------------- */

const STAGE_FLOW = ["to-pick", "packing", "ready", "shipped", "delivered"] as const;

export async function advanceOrderStage(
  orderId: string,
  toStage: string,
): Promise<Result> {
  if (!(STAGE_FLOW as readonly string[]).includes(toStage)) {
    return { ok: false, reason: `Unknown fulfillment stage "${toStage}".` };
  }
  const client = await db();
  const uuid = await resolveOrderId(client, orderId);
  if (!uuid) return { ok: false, reason: "Order not found." };

  const patch: Record<string, unknown> = { fulfillment_stage: toStage };
  if (toStage === "shipped" || toStage === "delivered") patch.status = "fulfilled";
  let { error } = await client.from("orders").update(patch as never).eq("id", uuid);
  if (error && isMissingColumn(error)) {
    /* Pre-00012: no fulfillment_stage column — still move the status
     * for the shipped transition; other stages have no DB home yet. */
    if (toStage === "shipped" || toStage === "delivered") {
      ({ error } = await client
        .from("orders")
        .update({ status: "fulfilled" })
        .eq("id", uuid));
    } else {
      return {
        ok: false,
        reason:
          "Fulfillment stages need migration 00012, which has not been applied yet.",
      };
    }
  }
  if (error) return fail(error, "Could not advance the order stage.");
  await addEvent(
    client,
    uuid,
    toStage === "shipped" || toStage === "delivered" ? "fulfilled" : "note_added",
    toStage === "shipped" || toStage === "delivered"
      ? "Order fulfilled (stage advanced to shipped)."
      : `Stage advanced to ${toStage}.`,
  );
  revalidate(...ORDER_PATHS, `/admin/orders/${orderId}`);
  return { ok: true };
}

export async function cancelOrder(orderId: string): Promise<Result> {
  const client = await db();
  const uuid = await resolveOrderId(client, orderId);
  if (!uuid) return { ok: false, reason: "Order not found." };
  const { error } = await client
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", uuid);
  if (error) return fail(error, "Could not cancel the order.");
  await addEvent(client, uuid, "cancelled", "Order cancelled from the console.");
  revalidate(...ORDER_PATHS, `/admin/orders/${orderId}`);
  return { ok: true };
}

export async function refundOrder(
  orderId: string,
  amountCents: number,
  reason?: string,
): Promise<Result> {
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { ok: false, reason: "Refund amount must be greater than zero." };
  }
  const client = await db();
  const uuid = await resolveOrderId(client, orderId);
  if (!uuid) return { ok: false, reason: "Order not found." };
  /* The RPC takes DOLLARS (numeric) — ruling 6 / 00011 signature. */
  const { error } = await client.rpc("issue_order_refund", {
    p_order_id: uuid,
    p_amount: amountCents / 100,
    p_reason: reason ?? null,
  });
  if (error) return fail(error, "Refund failed.");
  revalidate(...ORDER_PATHS, `/admin/orders/${orderId}`);
  return { ok: true };
}

export async function addOrderNote(orderId: string, text: string): Promise<Result> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "Note text is empty." };
  const client = await db();
  const uuid = await resolveOrderId(client, orderId);
  if (!uuid) return { ok: false, reason: "Order not found." };
  const { error } = await client.from("order_events").insert({
    order_id: uuid,
    event_type: "note_added",
    message: trimmed,
  });
  if (error) return fail(error, "Could not add the note.");
  revalidate(...ORDER_PATHS, `/admin/orders/${orderId}`);
  return { ok: true };
}

/**
 * Recount one order line (ruling 5): the counted quantity becomes the
 * variant's on-hand via adjust_inventory(reason 'recount'), referenced
 * to the order. A count equal to the current on-hand is a successful
 * no-op (the RPC rejects zero deltas by design).
 */
export async function recountOrderLine(
  orderId: string,
  variantId: string,
  countedQty: number,
): Promise<Result> {
  if (!Number.isInteger(countedQty) || countedQty < 0) {
    return { ok: false, reason: "Counted quantity must be a whole number ≥ 0." };
  }
  const client = await db();
  const uuid = await resolveOrderId(client, orderId);
  if (!uuid) return { ok: false, reason: "Order not found." };
  const vid = await resolveVariantId(client, variantId);
  if (!vid) return { ok: false, reason: "Variant not found." };
  const { data: level } = await client
    .from("inventory_levels")
    .select("quantity_on_hand")
    .eq("variant_id", vid)
    .maybeSingle();
  if (!level) return { ok: false, reason: "No inventory record for this variant." };
  const delta = countedQty - (level as { quantity_on_hand: number }).quantity_on_hand;
  if (delta !== 0) {
    const { error } = await client.rpc("adjust_inventory", {
      p_variant_id: vid,
      p_delta: delta,
      p_reason: "recount",
      p_reference: orderId.toUpperCase(),
      p_note: "Recount from the order page.",
    });
    if (error) return fail(error, "Recount failed.");
  }
  await addEvent(
    client,
    uuid,
    "note_added",
    `Line recounted at ${countedQty} (was ${(level as { quantity_on_hand: number }).quantity_on_hand}).`,
  );
  revalidate(...ORDER_PATHS, `/admin/orders/${orderId}`, "/admin/inventory");
  return { ok: true };
}

/* ---------------- inventory ---------------- */

const REASON_MAP: Record<string, string> = {
  sale: "sale",
  restock_received: "restock_received",
  restock: "restock_received",
  received: "restock_received",
  delivery: "restock_received",
  damaged: "damaged",
  damage: "damaged",
  recount: "recount",
  count: "recount",
  return: "return",
  returned: "return",
  cancelled_order: "cancelled_order",
  cancelled: "cancelled_order",
  canceled: "cancelled_order",
  manual: "manual",
};

export async function adjustStock(
  variantId: string,
  delta: number,
  reason: string,
  note?: string,
): Promise<Result> {
  if (!Number.isInteger(delta) || delta === 0) {
    return { ok: false, reason: "Adjustment delta must be a non-zero whole number." };
  }
  const mapped = REASON_MAP[reason.trim().toLowerCase().replace(/\s+/g, "_")] ?? "manual";
  const client = await db();
  const vid = await resolveVariantId(client, variantId);
  if (!vid) return { ok: false, reason: "Variant not found." };
  const { error } = await client.rpc("adjust_inventory", {
    p_variant_id: vid,
    p_delta: delta,
    p_reason: mapped,
    p_reference: null,
    p_note: note ?? null,
  });
  if (error) return fail(error, "Stock adjustment failed.");
  revalidate("/admin/inventory", "/admin");
  return { ok: true };
}

export async function setVariantThreshold(
  variantId: string,
  threshold: number,
): Promise<Result> {
  if (!Number.isInteger(threshold) || threshold < 0) {
    return { ok: false, reason: "Threshold must be a whole number ≥ 0." };
  }
  const client = await db();
  const vid = await resolveVariantId(client, variantId);
  if (!vid) return { ok: false, reason: "Variant not found." };
  const { error } = await client.rpc("set_low_stock_threshold", {
    p_variant_id: vid,
    p_threshold: threshold,
  });
  if (error) return fail(error, "Could not set the threshold.");
  revalidate("/admin/inventory");
  return { ok: true };
}

/**
 * Receive a purchase order (ruling 13): per-line restock via
 * adjust_inventory(restock_received, reference = PO id), then the PO
 * flips to 'received'. Idempotent: an already-received PO returns
 * ok without moving stock twice.
 */
export async function receivePurchaseOrder(poId: string): Promise<Result> {
  const client = await db();
  const { data: po, error: poErr } = await client
    .from("purchase_orders")
    .select("id, supplier, eta, status, created_by, created_at, updated_at")
    .eq("id", poId)
    .maybeSingle();
  if (isMissingTable(poErr)) {
    return {
      ok: false,
      reason:
        "Purchase orders need migration 00012, which has not been applied yet.",
    };
  }
  if (poErr) return fail(poErr, "Could not read the purchase order.");
  if (!po) return { ok: false, reason: "Purchase order not found." };
  if ((po as { status: string }).status === "received") return { ok: true };
  const { data: lines, error: lineErr } = await client
    .from("purchase_order_lines")
    .select("id, po_id, variant_id, sku, qty")
    .eq("po_id", poId);
  if (lineErr) return fail(lineErr, "Could not read the purchase order lines.");
  for (const line of (lines ?? []) as {
    variant_id: string | null;
    sku: string;
    qty: number;
  }[]) {
    const vid = line.variant_id ?? (await resolveVariantId(client, line.sku));
    if (!vid) return { ok: false, reason: `Variant for SKU ${line.sku} not found.` };
    const { error } = await client.rpc("adjust_inventory", {
      p_variant_id: vid,
      p_delta: line.qty,
      p_reason: "restock_received",
      p_reference: poId,
      p_note: "Purchase order received.",
    });
    if (error) return fail(error, `Restock failed for ${line.sku}.`);
  }
  const { error: updErr } = await client
    .from("purchase_orders")
    .update({ status: "received" })
    .eq("id", poId);
  if (updErr) return fail(updErr, "Stock landed but the PO status update failed.");
  revalidate("/admin/inventory", "/admin/products", "/admin");
  return { ok: true };
}

/* ---------------- products & variants ---------------- */

function productStatusToDb(status: string): string | null {
  switch (status) {
    case "active":
    case "published":
      return "published";
    case "draft":
      return "draft";
    case "archived":
      return "archived";
    default:
      return null;
  }
}

type Patch = Record<string, unknown>;
const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;
const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

export async function updateProduct(id: string, patch: Patch): Promise<Result> {
  const client = await db();
  const pid = await resolveProductId(client, id);
  if (!pid) return { ok: false, reason: "Product not found." };
  const update: Record<string, unknown> = {};
  const title = str(patch.title) ?? str(patch.name);
  if (title !== undefined) update.title = title;
  const slug = str(patch.slug);
  if (slug !== undefined) update.slug = slug;
  const description = str(patch.description);
  if (description !== undefined) update.description = description;
  const statusRaw = str(patch.status);
  if (statusRaw !== undefined) {
    const mapped = productStatusToDb(statusRaw);
    if (!mapped) return { ok: false, reason: `Unknown product status "${statusRaw}".` };
    update.status = mapped;
  }
  if (Array.isArray(patch.tags)) update.tags = patch.tags;
  const categoryName = str(patch.collection) ?? str(patch.category);
  if (categoryName !== undefined) {
    const { data: cat } = await client
      .from("categories")
      .select("id")
      .or(`name.eq.${categoryName},slug.eq.${categoryName}`)
      .maybeSingle();
    update.category_id = (cat as { id: string } | null)?.id ?? null;
  }
  if (Object.keys(update).length === 0) {
    return { ok: false, reason: "Nothing to update." };
  }
  const { error } = await client.from("products").update(update as never).eq("id", pid);
  if (error) return fail(error, "Product update failed.");
  revalidate("/admin/products", "/admin/inventory", "/admin");
  return { ok: true };
}

export async function updateVariant(id: string, patch: Patch): Promise<Result> {
  const client = await db();
  const vid = await resolveVariantId(client, id);
  if (!vid) return { ok: false, reason: "Variant not found." };
  const update: Record<string, unknown> = {};
  const title = str(patch.title) ?? str(patch.label);
  if (title !== undefined) update.title = title;
  const sku = str(patch.sku);
  if (sku !== undefined) update.sku = sku;
  const priceCents = num(patch.priceCents) ?? num(patch.price_cents);
  if (priceCents !== undefined) update.price = priceCents / 100;
  else if (num(patch.price) !== undefined) update.price = num(patch.price);
  const shelf = str(patch.shelf);
  if (shelf !== undefined) update.shelf = shelf;
  const costCents = num(patch.costCents) ?? num(patch.cost_cents);
  if (costCents !== undefined) update.cost_price = costCents / 100;
  /* Compare-at price (W-CATALOG): both payload names accepted; an
   * explicit null clears the column. */
  if ("compareAtCents" in patch || "compareAtPriceCents" in patch) {
    const raw = "compareAtCents" in patch ? patch.compareAtCents : patch.compareAtPriceCents;
    if (raw === null) update.compare_at_price = null;
    else if (typeof raw === "number" && Number.isFinite(raw)) {
      update.compare_at_price = raw / 100;
    }
  }

  if (Object.keys(update).length > 0) {
    let { error } = await client.from("product_variants").update(update as never).eq("id", vid);
    if (error && isMissingColumn(error)) {
      /* Pre-00012: shelf/cost_price have no home — retry without them. */
      const legacy = { ...update };
      delete legacy.shelf;
      delete legacy.cost_price;
      if (Object.keys(legacy).length > 0) {
        ({ error } = await client.from("product_variants").update(legacy as never).eq("id", vid));
      } else {
        return {
          ok: false,
          reason:
            "Shelf and cost need migration 00012, which has not been applied yet.",
        };
      }
    }
    if (error) return fail(error, "Variant update failed.");
  }
  const threshold = num(patch.reorderPoint) ?? num(patch.low_stock_threshold) ?? num(patch.threshold);
  if (threshold !== undefined) {
    const r = await setVariantThreshold(vid, threshold);
    if (!r.ok) return r;
  }
  revalidate("/admin/products", "/admin/inventory");
  return { ok: true };
}

export async function createProduct(payload: Patch): Promise<Result> {
  const title = str(payload.title) ?? str(payload.name);
  if (!title) return { ok: false, reason: "A product needs a name." };
  const slug =
    str(payload.slug) ??
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const statusRaw = str(payload.status) ?? "draft";
  const status = productStatusToDb(statusRaw);
  if (!status) return { ok: false, reason: `Unknown product status "${statusRaw}".` };
  const client = await db();
  let categoryId: string | null = null;
  const categoryName = str(payload.collection) ?? str(payload.category);
  if (categoryName) {
    const { data: cat } = await client
      .from("categories")
      .select("id")
      .or(`name.eq.${categoryName},slug.eq.${categoryName}`)
      .maybeSingle();
    categoryId = (cat as { id: string } | null)?.id ?? null;
  }
  const { data: created, error } = await client
    .from("products")
    .insert({
      title,
      slug,
      description: str(payload.description) ?? "",
      category_id: categoryId,
      tags: Array.isArray(payload.tags) ? (payload.tags as string[]) : [],
      status,
    })
    .select("id")
    .single();
  if (error) return fail(error, "Product creation failed.");
  const pid = (created as { id: string }).id;
  const variants = Array.isArray(payload.variants)
    ? (payload.variants as Patch[])
    : [];
  for (const [i, v] of variants.entries()) {
    const vSku = str(v.sku);
    const vTitle = str(v.title) ?? str(v.label) ?? `Variant ${i + 1}`;
    const vPriceCents = num(v.priceCents) ?? num(v.price_cents);
    if (!vSku || vPriceCents === undefined) {
      return {
        ok: false,
        reason: `Variant ${i + 1} needs a SKU and a price; the product was created without it.`,
      };
    }
    /* Per-variant 00012 fields + compare-at, when the wizard sends
     * them (W-CATALOG ask). Quantity is NOT handled here: the wizard's
     * post-create adjustStock calls land it (logged choice). */
    const vShelf = str(v.shelf);
    const vCostCents = num(v.costCents) ?? num(v.cost_cents);
    const vCompareCents = num(v.compareAtCents) ?? num(v.compareAtPriceCents);
    const insertRow: Record<string, unknown> = {
      product_id: pid,
      title: vTitle,
      sku: vSku,
      option_values: ((v.option_values as Record<string, unknown>) ?? {}) as never,
      price: vPriceCents / 100,
      position: i,
    };
    if (vCompareCents !== undefined) insertRow.compare_at_price = vCompareCents / 100;
    if (vShelf !== undefined) insertRow.shelf = vShelf;
    if (vCostCents !== undefined) insertRow.cost_price = vCostCents / 100;
    let inserted = await client
      .from("product_variants")
      .insert(insertRow as never)
      .select("id")
      .single();
    if (inserted.error && isMissingColumn(inserted.error)) {
      /* Pre-00012: shelf/cost_price have no home — retry without them. */
      const legacy = { ...insertRow };
      delete legacy.shelf;
      delete legacy.cost_price;
      inserted = await client
        .from("product_variants")
        .insert(legacy as never)
        .select("id")
        .single();
    }
    if (inserted.error) return fail(inserted.error, `Variant ${vSku} could not be created.`);
    /* Low-stock threshold lands on the auto-created inventory level
     * via the role-checked RPC (inventory_levels has no direct write
     * policy). */
    const vThreshold =
      num(v.reorderPoint) ?? num(v.low_stock_threshold) ?? num(v.threshold);
    if (vThreshold !== undefined) {
      const newVariantId = (inserted.data as { id: string }).id;
      const { error: tErr } = await client.rpc("set_low_stock_threshold", {
        p_variant_id: newVariantId,
        p_threshold: vThreshold,
      });
      if (tErr) {
        return fail(
          tErr,
          `Product and variant ${vSku} were created, but setting its low-stock threshold failed.`,
        );
      }
    }
  }
  revalidate("/admin/products", "/admin/inventory");
  return { ok: true };
}

export async function setProductStatus(id: string, status: string): Promise<Result> {
  const mapped = productStatusToDb(status);
  if (!mapped) return { ok: false, reason: `Unknown product status "${status}".` };
  const client = await db();
  const pid = await resolveProductId(client, id);
  if (!pid) return { ok: false, reason: "Product not found." };
  const { error } = await client
    .from("products")
    .update({ status: mapped })
    .eq("id", pid);
  if (error) return fail(error, "Status update failed.");
  revalidate("/admin/products", "/admin/inventory");
  return { ok: true };
}

/* ---------------- discounts ---------------- */

function discountKindToDb(kind: string): string | null {
  switch (kind) {
    case "percent":
    case "percentage":
      return "percentage";
    case "fixed":
    case "fixed-amount":
    case "fixed_amount":
      return "fixed";
    default:
      return null;
  }
}

export async function createDiscount(payload: Patch): Promise<Result> {
  const code = str(payload.code)?.trim().toUpperCase();
  if (!code) return { ok: false, reason: "A discount needs a code." };
  const kindRaw = str(payload.kind) ?? "percent";
  const kind = discountKindToDb(kindRaw);
  if (!kind) {
    return {
      ok: false,
      reason: `Discount kind "${kindRaw}" is not supported — the shop offers percentage and fixed-amount codes only.`,
    };
  }
  let value: number | undefined;
  if (kind === "percentage") {
    value = num(payload.pct) ?? num(payload.value) ?? num(payload.percent);
  } else {
    const amountCents = num(payload.amountCents) ?? num(payload.valueCents);
    value =
      amountCents !== undefined ? amountCents / 100 : num(payload.value) ?? num(payload.amount);
  }
  if (value === undefined || value <= 0) {
    return { ok: false, reason: "A discount needs a positive value." };
  }
  const client = await db();
  const { error } = await client.from("discounts").insert({
    code,
    kind,
    value,
    usage_limit: num(payload.useLimit) ?? num(payload.usage_limit) ?? null,
    per_customer_limit:
      num(payload.usesPerCustomer) ?? num(payload.per_customer_limit) ?? null,
    min_order_value:
      (num(payload.minOrderCents) ?? num(payload.min_order_cents)) != null
        ? (num(payload.minOrderCents) ?? num(payload.min_order_cents))! / 100
        : 0,
    starts_at: str(payload.startsAt) ?? str(payload.starts_at) ?? new Date().toISOString(),
    ends_at: str(payload.endsAt) ?? str(payload.ends_at) ?? null,
    status: "active",
  });
  if (error) return fail(error, "Discount creation failed.");
  revalidate("/admin/discounts");
  return { ok: true };
}

export async function updateDiscount(id: string, patch: Patch): Promise<Result> {
  const client = await db();
  const did = await resolveDiscountId(client, id);
  if (!did) return { ok: false, reason: "Discount not found." };
  const update: Record<string, unknown> = {};
  const code = str(patch.code);
  if (code !== undefined) update.code = code.trim().toUpperCase();
  const kindRaw = str(patch.kind);
  if (kindRaw !== undefined) {
    const kind = discountKindToDb(kindRaw);
    if (!kind) return { ok: false, reason: `Unknown discount kind "${kindRaw}".` };
    update.kind = kind;
  }
  const pct = num(patch.pct) ?? num(patch.percent);
  if (pct !== undefined) update.value = pct;
  const amountCents = num(patch.amountCents) ?? num(patch.valueCents);
  if (amountCents !== undefined) update.value = amountCents / 100;
  if (num(patch.value) !== undefined && pct === undefined && amountCents === undefined) {
    update.value = num(patch.value);
  }
  const useLimit = num(patch.useLimit) ?? num(patch.usage_limit);
  if (useLimit !== undefined) update.usage_limit = useLimit;
  const perCustomer = num(patch.usesPerCustomer) ?? num(patch.per_customer_limit);
  if (perCustomer !== undefined) update.per_customer_limit = perCustomer;
  const minOrder = num(patch.minOrderCents) ?? num(patch.min_order_cents);
  if (minOrder !== undefined) update.min_order_value = minOrder / 100;
  const startsAt = str(patch.startsAt) ?? str(patch.starts_at);
  if (startsAt !== undefined) update.starts_at = startsAt;
  const endsAt = str(patch.endsAt) ?? str(patch.ends_at);
  if (endsAt !== undefined) update.ends_at = endsAt;
  if (Object.keys(update).length === 0) {
    return { ok: false, reason: "Nothing to update." };
  }
  const { error } = await client.from("discounts").update(update as never).eq("id", did);
  if (error) return fail(error, "Discount update failed.");
  revalidate("/admin/discounts");
  return { ok: true };
}

export async function setDiscountStatus(
  id: string,
  status: string,
): Promise<Result> {
  const client = await db();
  const did = await resolveDiscountId(client, id);
  if (!did) return { ok: false, reason: "Discount not found." };
  let update: Record<string, unknown>;
  switch (status) {
    case "running":
    case "active":
      update = { status: "active", ends_at: null };
      break;
    case "paused":
      update = { status: "paused" };
      break;
    case "ended":
      /* The DB has no 'ended' status — ending is ends_at = now, which
       * the read mapper derives as 'ended'. */
      update = { status: "active", ends_at: new Date().toISOString() };
      break;
    case "scheduled":
      return {
        ok: false,
        reason:
          "A discount becomes scheduled by setting a future start date (updateDiscount), not by a status change.",
      };
    default:
      return { ok: false, reason: `Unknown discount status "${status}".` };
  }
  const { error } = await client.from("discounts").update(update as never).eq("id", did);
  if (error) return fail(error, "Discount status update failed.");
  revalidate("/admin/discounts");
  return { ok: true };
}

/* ---------------- customers ---------------- */

export async function updateCustomer(id: string, patch: Patch): Promise<Result> {
  const client = await db();
  const update: Record<string, unknown> = {};
  const name = str(patch.name);
  if (name !== undefined) {
    const parts = name.trim().split(/\s+/);
    update.first_name = parts[0] ?? "";
    update.last_name = parts.slice(1).join(" ");
  }
  const first = str(patch.firstName) ?? str(patch.first_name);
  if (first !== undefined) update.first_name = first;
  const last = str(patch.lastName) ?? str(patch.last_name);
  if (last !== undefined) update.last_name = last;
  const email = str(patch.email);
  if (email !== undefined) update.email = email || null;
  const phone = str(patch.phone);
  if (phone !== undefined) update.phone = phone || null;
  if (Array.isArray(patch.tags)) update.tags = patch.tags;
  const notes = str(patch.notes);
  if (notes !== undefined) update.notes = notes;
  if (Object.keys(update).length === 0) {
    return { ok: false, reason: "Nothing to update." };
  }
  const { error } = await client.from("customers").update(update as never).eq("id", id);
  if (error) return fail(error, "Customer update failed.");
  revalidate("/admin/customers", `/admin/customers/${id}`);
  return { ok: true };
}

export async function addCustomerNote(id: string, text: string): Promise<Result> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "Note text is empty." };
  const client = await db();
  const { data: row, error: readErr } = await client
    .from("customers")
    .select("notes")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return fail(readErr, "Could not read the customer.");
  if (!row) return { ok: false, reason: "Customer not found." };
  const existing = (row as { notes: string }).notes ?? "";
  const stamp = new Date().toISOString().slice(0, 10);
  const next = existing
    ? `${existing}\n\n[${stamp}] ${trimmed}`
    : `[${stamp}] ${trimmed}`;
  const { error } = await client
    .from("customers")
    .update({ notes: next })
    .eq("id", id);
  if (error) return fail(error, "Could not add the note.");
  revalidate("/admin/customers", `/admin/customers/${id}`);
  return { ok: true };
}

/* ---------------- settings & team ---------------- */

const SETTING_KEYS = ["tax_rate", "shipping_flat", "free_shipping_threshold"] as const;

/**
 * Value units (see W-DATA log): 'tax_rate' takes PERCENT POINTS
 * (6 → stored as the 0.06 fraction the totals RPC multiplies by);
 * 'shipping_flat' / 'free_shipping_threshold' take DOLLARS;
 * free_shipping_threshold also accepts null (no free-shipping rule).
 */
export async function updateStoreSetting(
  key: string,
  value: number | null,
): Promise<Result> {
  if (!(SETTING_KEYS as readonly string[]).includes(key)) {
    return { ok: false, reason: `Unknown store setting "${key}".` };
  }
  if (key !== "free_shipping_threshold" && (value == null || !Number.isFinite(value))) {
    return { ok: false, reason: "This setting needs a numeric value." };
  }
  const stored = key === "tax_rate" ? (value as number) / 100 : value;
  const client = await db();
  const { error } = await client
    .from("store_settings")
    .upsert({ key, value: stored }, { onConflict: "key" });
  if (error) return fail(error, "Setting update failed.");
  revalidate("/admin/settings");
  return { ok: true };
}

const ROLE_MAP: Record<string, string> = {
  admin: "admin",
  warehouse: "warehouse",
  support: "support",
  Owner: "admin",
  Fulfillment: "warehouse",
  "Customer service": "support",
};

export async function updateMemberRole(
  userId: string,
  role: string,
): Promise<Result> {
  const client = await db();
  if (role === "none" || role === "") {
    const { error } = await client.from("user_roles").delete().eq("user_id", userId);
    if (error) return fail(error, "Role removal failed.");
    revalidate("/admin/settings/team");
    return { ok: true };
  }
  const mapped = ROLE_MAP[role];
  if (!mapped) return { ok: false, reason: `Unknown role "${role}".` };
  const { data: auth } = await client.auth.getUser();
  const { error } = await client.from("user_roles").upsert(
    { user_id: userId, role: mapped, granted_by: auth.user?.id ?? null },
    { onConflict: "user_id" },
  );
  if (error) return fail(error, "Role update failed.");
  revalidate("/admin/settings/team");
  return { ok: true };
}
