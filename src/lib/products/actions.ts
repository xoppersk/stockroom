"use server";

/**
 * Product catalog server actions (Phase 3).
 *
 * Every action calls `requireRole("admin")` first — catalog writes are
 * admin-only per the RLS `admin_write` policies (DATABASE-SCHEMA.md §3), and
 * the role is re-checked server-side on every mutation, never trusted from
 * the client. Inputs are validated with Zod before touching the database.
 *
 * Two schema quirks handled here (see src/lib/products/types.ts):
 *  - `inventory_levels` rows are auto-created by a trigger on variant insert
 *    (qty 0, threshold 10) and have no direct write policies, so opening
 *    stock goes through the `adjust_inventory` RPC (reason `restock_received`).
 *  - `low_stock_threshold` has no setter function/policy, so it is written
 *    with the service-role client as a best-effort step (graceful warning when
 *    the key isn't configured).
 */
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/roles";
import {
  createProductsClient,
  createProductsServiceClient,
  type ProductsDatabase,
} from "@/lib/products/types";
import {
  createProductSchema,
  setProductImagesSchema,
  updateProductSchema,
  upsertVariantsSchema,
  type CreateProductInput,
  type SetProductImagesInput,
  type UpdateProductInput,
  type UpsertVariantsInput,
  type VariantData,
} from "@/lib/products/schemas";
import type { SupabaseClient } from "@supabase/supabase-js";

/* ------------------------------------------------------------------ */
/* Result types                                                        */
/* ------------------------------------------------------------------ */

export type ProductActionResult = { ok: true } | { ok: false; error: string };

export type CreateProductResult =
  | { ok: true; id: string; warning?: string }
  | { ok: false; error: string };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function zodMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

type ProductsClient = SupabaseClient<ProductsDatabase>;

/**
 * Insert variant rows for a product, then set opening stock + thresholds.
 * `inventory_levels` rows already exist (insert trigger); quantities move via
 * `adjust_inventory`, thresholds via the service-role client (best effort).
 */
async function createVariantsWithStock(
  supabase: ProductsClient,
  productId: string,
  variants: VariantData[],
): Promise<{ ok: true; warning?: string } | { ok: false; error: string }> {
  const { data: inserted, error: insertError } = await supabase
    .from("product_variants")
    .insert(
      variants.map((v, index) => ({
        product_id: productId,
        title: v.title,
        sku: v.sku,
        option_values: v.optionValues,
        price: v.price,
        compare_at_price: v.compareAtPrice,
        position: v.position ?? index,
      })),
    )
    .select("id, sku");

  if (insertError || !inserted) {
    return { ok: false, error: insertError?.message ?? "Couldn't create the variants." };
  }

  const bySku = new Map(variants.map((v) => [v.sku, v]));

  for (const row of inserted) {
    const src = bySku.get(row.sku);
    if (!src || src.quantityOnHand <= 0) continue;
    const { error: adjustError } = await supabase.rpc("adjust_inventory", {
      p_variant_id: row.id,
      p_delta: src.quantityOnHand,
      p_reason: "restock_received",
      p_reference: "initial-stock",
      p_note: "Opening stock set when the variant was created.",
    });
    if (adjustError) {
      return { ok: false, error: adjustError.message };
    }
  }

  let warning: string | undefined;
  const needsThreshold = variants.some((v) => v.lowStockThreshold !== 10);
  if (needsThreshold) {
    try {
      const svc = createProductsServiceClient();
      for (const row of inserted) {
        const src = bySku.get(row.sku);
        if (!src || src.lowStockThreshold === 10) continue;
        const { error: thresholdError } = await svc
          .from("inventory_levels")
          .update({ low_stock_threshold: src.lowStockThreshold })
          .eq("variant_id", row.id);
        if (thresholdError) {
          warning = "Some low-stock thresholds couldn't be saved.";
          break;
        }
      }
    } catch {
      warning =
        "Low-stock thresholds need the service-role key configured; they were left at 10.";
    }
  }

  return warning ? { ok: true, warning } : { ok: true };
}

/** Roll back a half-created product (variants/images/stock cascade). */
async function deleteProductCascade(supabase: ProductsClient, productId: string) {
  await supabase.from("products").delete().eq("id", productId);
}

async function slugInUse(supabase: ProductsClient, slug: string): Promise<boolean> {
  const { data } = await supabase.from("products").select("id").eq("slug", slug).maybeSingle();
  return !!data;
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

/** Create a product with its variants, opening stock, and images. */
export async function createProduct(rawInput: CreateProductInput): Promise<CreateProductResult> {
  const { user } = await requireRole("admin");

  const parsed = createProductSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: zodMessage(parsed.error) };
  const { details, variants, images, status } = parsed.data;

  const supabase = await createProductsClient();

  if (await slugInUse(supabase, details.slug)) {
    return { ok: false, error: `The slug "${details.slug}" is already in use.` };
  }

  const { data: skuConflict } = await supabase
    .from("product_variants")
    .select("sku")
    .in(
      "sku",
      variants.map((v) => v.sku),
    )
    .limit(1);
  if (skuConflict && skuConflict.length > 0) {
    return { ok: false, error: `SKU "${skuConflict[0]?.sku}" is already in use.` };
  }

  const { data: product, error: productError } = await supabase
    .from("products")
    .insert({
      title: details.title,
      slug: details.slug,
      description: details.description,
      category_id: details.categoryId,
      tags: details.tags,
      status,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (productError || !product) {
    return { ok: false, error: productError?.message ?? "Couldn't create the product." };
  }

  const variantsResult = await createVariantsWithStock(supabase, product.id, variants);
  if (!variantsResult.ok) {
    await deleteProductCascade(supabase, product.id);
    return variantsResult;
  }

  if (images.length > 0) {
    const { error: imageError } = await supabase.from("product_images").insert(
      images.map((img, index) => ({
        product_id: product.id,
        storage_path: img.url,
        alt_text: img.altText,
        position: img.position ?? index,
      })),
    );
    if (imageError) {
      await deleteProductCascade(supabase, product.id);
      return { ok: false, error: imageError.message };
    }
  }

  revalidatePath("/products");
  return variantsResult.warning
    ? { ok: true, id: product.id, warning: variantsResult.warning }
    : { ok: true, id: product.id };
}

/** Update a product's details (title, slug, description, category, tags). */
export async function updateProduct(
  productId: string,
  rawInput: UpdateProductInput,
): Promise<ProductActionResult> {
  await requireRole("admin");

  const parsed = updateProductSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: zodMessage(parsed.error) };
  const { details } = parsed.data;

  const supabase = await createProductsClient();

  const { data: current } = await supabase
    .from("products")
    .select("id, slug")
    .eq("id", productId)
    .maybeSingle();
  if (!current) return { ok: false, error: "Product not found." };

  if (details.slug !== current.slug && (await slugInUse(supabase, details.slug))) {
    return { ok: false, error: `The slug "${details.slug}" is already in use.` };
  }

  const { error } = await supabase
    .from("products")
    .update({
      title: details.title,
      slug: details.slug,
      description: details.description,
      category_id: details.categoryId,
      tags: details.tags,
    })
    .eq("id", productId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  return { ok: true };
}

async function setProductStatus(
  productId: string,
  status: "draft" | "published" | "archived",
): Promise<ProductActionResult> {
  await requireRole("admin");
  const supabase = await createProductsClient();

  const { data: product } = await supabase
    .from("products")
    .select("id, status")
    .eq("id", productId)
    .maybeSingle();
  if (!product) return { ok: false, error: "Product not found." };

  if (status === "published") {
    const { count } = await supabase
      .from("product_variants")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId);
    if (!count) {
      return { ok: false, error: "Add at least one variant before publishing." };
    }
  }

  const { error } = await supabase.from("products").update({ status }).eq("id", productId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  return { ok: true };
}

/** Publish a draft/archived product (requires at least one variant). */
export async function publishProduct(productId: string): Promise<ProductActionResult> {
  return setProductStatus(productId, "published");
}

/** Move a published product back to draft (hidden from the storefront). */
export async function unpublishProduct(productId: string): Promise<ProductActionResult> {
  return setProductStatus(productId, "draft");
}

/**
 * Archive a product. Archived products disappear from sellable lists but keep
 * their variants, stock, and order history intact.
 */
export async function archiveProduct(productId: string): Promise<ProductActionResult> {
  return setProductStatus(productId, "archived");
}

/**
 * Duplicate a product as a new draft: copies details, variants (fresh SKUs,
 * zero opening stock — physical stock is never duplicated), images, and
 * low-stock thresholds.
 */
export async function duplicateProduct(productId: string): Promise<CreateProductResult> {
  const { user } = await requireRole("admin");
  const supabase = await createProductsClient();

  const { data: source } = await supabase
    .from("products")
    .select("*, product_variants(*, inventory_levels(low_stock_threshold)), product_images(*)")
    .eq("id", productId)
    .order("position", { referencedTable: "product_variants", ascending: true })
    .maybeSingle();
  if (!source) return { ok: false, error: "Product not found." };

  let slug = `${source.slug}-copy`;
  for (let n = 2; await slugInUse(supabase, slug); n += 1) {
    slug = `${source.slug}-copy-${n}`;
  }

  const { data: product, error: productError } = await supabase
    .from("products")
    .insert({
      title: `${source.title} (Copy)`,
      slug,
      description: source.description,
      category_id: source.category_id,
      tags: source.tags,
      status: "draft",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (productError || !product) {
    return { ok: false, error: productError?.message ?? "Couldn't duplicate the product." };
  }

  // Fresh SKUs: "<sku>-COPY", "<sku>-COPY-2", … — guaranteed unique.
  const usedSkus = new Set<string>();
  const seeds: VariantData[] = [];
  for (const v of source.product_variants) {
    let sku = `${v.sku}-COPY`;
    for (let n = 2; usedSkus.has(sku.toLowerCase()); n += 1) {
      sku = `${v.sku}-COPY-${n}`;
    }
    const { data: taken } = await supabase
      .from("product_variants")
      .select("id")
      .eq("sku", sku)
      .maybeSingle();
    if (taken) {
      let n = 2;
      let candidate = `${sku}-${n}`;
      let conflict = await supabase
        .from("product_variants")
        .select("id")
        .eq("sku", candidate)
        .maybeSingle();
      while (conflict.data) {
        n += 1;
        candidate = `${sku}-${n}`;
        conflict = await supabase
          .from("product_variants")
          .select("id")
          .eq("sku", candidate)
          .maybeSingle();
      }
      sku = candidate;
    }
    usedSkus.add(sku.toLowerCase());
    seeds.push({
      title: v.title,
      sku,
      optionValues: v.option_values,
      price: Number(v.price),
      compareAtPrice: v.compare_at_price === null ? null : Number(v.compare_at_price),
      position: v.position,
      quantityOnHand: 0,
      lowStockThreshold: v.inventory_levels?.low_stock_threshold ?? 10,
    });
  }

  const variantsResult = await createVariantsWithStock(supabase, product.id, seeds);
  if (!variantsResult.ok) {
    await deleteProductCascade(supabase, product.id);
    return variantsResult;
  }

  if (source.product_images.length > 0) {
    const { error: imageError } = await supabase.from("product_images").insert(
      source.product_images.map((img) => ({
        product_id: product.id,
        storage_path: img.storage_path,
        alt_text: img.alt_text,
        position: img.position,
      })),
    );
    if (imageError) {
      await deleteProductCascade(supabase, product.id);
      return { ok: false, error: imageError.message };
    }
  }

  revalidatePath("/products");
  return variantsResult.warning
    ? { ok: true, id: product.id, warning: variantsResult.warning }
    : { ok: true, id: product.id };
}

/**
 * Sync a product's variant set: updates rows with ids, inserts new rows
 * (with opening stock via `adjust_inventory`), and deletes rows that were
 * removed. Deleting a variant keeps order history — `order_items.variant_id`
 * is set null while the title/SKU/price snapshots stay.
 */
export async function upsertVariants(
  rawInput: UpsertVariantsInput,
): Promise<ProductActionResult & { warning?: string }> {
  await requireRole("admin");

  const parsed = upsertVariantsSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: zodMessage(parsed.error) };
  const { productId, variants } = parsed.data;

  const supabase = await createProductsClient();

  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .maybeSingle();
  if (!product) return { ok: false, error: "Product not found." };

  const { data: existing } = await supabase
    .from("product_variants")
    .select("id")
    .eq("product_id", productId);
  const existingIds = new Set((existing ?? []).map((v) => v.id));
  const incomingIds = new Set(variants.flatMap((v) => (v.id ? [v.id] : [])));

  // Reject ids that don't belong to this product.
  for (const id of incomingIds) {
    if (!existingIds.has(id)) {
      return { ok: false, error: "One of the variants doesn't belong to this product." };
    }
  }

  // Global SKU uniqueness, excluding the rows being updated.
  let skuQuery = supabase
    .from("product_variants")
    .select("sku")
    .in(
      "sku",
      variants.map((v) => v.sku),
    );
  if (incomingIds.size > 0) {
    skuQuery = skuQuery.not("id", "in", `(${[...incomingIds].join(",")})`);
  }
  const { data: skuConflict } = await skuQuery.limit(1);
  if (skuConflict && skuConflict.length > 0) {
    return { ok: false, error: `SKU "${skuConflict[0]?.sku}" is already in use.` };
  }

  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from("product_variants")
      .delete()
      .in("id", toDelete);
    if (deleteError) return { ok: false, error: deleteError.message };
  }

  const toUpdate = variants.filter((v) => v.id !== undefined);
  for (const v of toUpdate) {
    const { error: updateError } = await supabase
      .from("product_variants")
      .update({
        title: v.title,
        sku: v.sku,
        option_values: v.optionValues,
        price: v.price,
        compare_at_price: v.compareAtPrice,
        position: v.position,
      })
      .eq("id", v.id as string);
    if (updateError) return { ok: false, error: updateError.message };
  }

  const toInsert = variants.filter((v) => v.id === undefined);
  if (toInsert.length > 0) {
    const insertResult = await createVariantsWithStock(supabase, productId, toInsert);
    if (!insertResult.ok) return insertResult;
    if (insertResult.warning) {
      revalidatePath("/products");
      revalidatePath(`/products/${productId}`);
      return { ok: true, warning: insertResult.warning };
    }
  }

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  return { ok: true };
}

/** Replace a product's image gallery (ordered). */
export async function setProductImages(
  rawInput: SetProductImagesInput,
): Promise<ProductActionResult> {
  await requireRole("admin");

  const parsed = setProductImagesSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: zodMessage(parsed.error) };
  const { productId, images } = parsed.data;

  const supabase = await createProductsClient();

  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .maybeSingle();
  if (!product) return { ok: false, error: "Product not found." };

  const { error: deleteError } = await supabase
    .from("product_images")
    .delete()
    .eq("product_id", productId);
  if (deleteError) return { ok: false, error: deleteError.message };

  if (images.length > 0) {
    const { error: insertError } = await supabase.from("product_images").insert(
      images.map((img, index) => ({
        product_id: productId,
        storage_path: img.url,
        alt_text: img.altText,
        position: img.position ?? index,
      })),
    );
    if (insertError) return { ok: false, error: insertError.message };
  }

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  return { ok: true };
}
