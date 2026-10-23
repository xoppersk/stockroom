import {
  createShopAnonClient,
  createShopServiceClient,
  createShopUserClient,
  productImageUrl,
  type ShopClient,
} from "./db";

/**
 * Catalog reads for the storefront (adapted from v1 `src/lib/shop/catalog.ts`).
 *
 * Products / variants / images / categories are read with the caller's own
 * client (anon or signed-in session) so the PUBLIC RLS policies (published
 * only) do the gating — exactly what a real shopper can see.
 *
 * Stock is the exception: `inventory_levels` has no anon grant and a
 * staff-read policy only, so available quantities are read with the
 * service-role client when it is configured (Vercel prod). Without the key,
 * `available` is null — "unknown", never an invented number — and checkout
 * still enforces stock server-side inside create_checkout_session().
 */

import type { ShopCategoryView, ShopProductView, ShopVariantView } from "./view";

export type { ShopCategoryView, ShopProductView, ShopVariantView } from "./view";
export { placeholderBg, isDarkBg } from "./view";

export type CatalogResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/* ------------------------------------------------------------------ */
/* Mapping helpers                                                     */
/* ------------------------------------------------------------------ */

function cents(numeric: string | number): number {
  return Math.round(Number(numeric) * 100);
}

function optionMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" || typeof v === "number") out[k] = String(v);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

async function stockByVariant(variantIds: string[]): Promise<Map<string, { onHand: number; threshold: number }> | null> {
  if (variantIds.length === 0) return new Map();
  const svc = createShopServiceClient();
  if (!svc) return null; // stock not readable in this environment
  const { data, error } = await svc
    .from("inventory_levels")
    .select("variant_id, quantity_on_hand, low_stock_threshold")
    .in("variant_id", variantIds);
  if (error) {
    console.error("[shop] inventory_levels read failed:", error.message);
    return null;
  }
  return new Map((data ?? []).map((r) => [r.variant_id, { onHand: r.quantity_on_hand, threshold: r.low_stock_threshold }]));
}

interface RawProduct {
  id: string;
  title: string;
  slug: string;
  description: string;
  category_id: string | null;
  tags: string[];
  created_at: string;
}

async function assemble(
  client: ShopClient,
  products: RawProduct[],
): Promise<ShopProductView[]> {
  if (products.length === 0) return [];
  const ids = products.map((p) => p.id);
  const [{ data: variants, error: vErr }, { data: images }, { data: categories }] = await Promise.all([
    client
      .from("product_variants")
      .select("id, product_id, title, sku, option_values, price, compare_at_price, position")
      .in("product_id", ids)
      .order("position", { ascending: true }),
    client
      .from("product_images")
      .select("product_id, storage_path, alt_text, position")
      .in("product_id", ids)
      .order("position", { ascending: true }),
    client.from("categories").select("id, name, slug"),
  ]);
  if (vErr) console.error("[shop] variants read failed:", vErr.message);

  const variantRows = variants ?? [];
  const stock = await stockByVariant(variantRows.map((v) => v.id));
  const categoryById = new Map((categories ?? []).map((c) => [c.id, c]));

  const variantsByProduct = new Map<string, ShopVariantView[]>();
  for (const v of variantRows) {
    const options = optionMap(v.option_values);
    const colour = options["Color"] ?? options["Colour"] ?? Object.values(options)[0] ?? v.title;
    const inv = stock?.get(v.id);
    const view: ShopVariantView = {
      id: v.id,
      title: v.title,
      sku: v.sku,
      colour,
      options,
      priceCents: cents(v.price),
      compareAtCents: v.compare_at_price != null ? cents(v.compare_at_price) : null,
      available: stock ? (inv?.onHand ?? 0) : null,
      lowStockThreshold: stock ? (inv?.threshold ?? null) : null,
    };
    const list = variantsByProduct.get(v.product_id) ?? [];
    list.push(view);
    variantsByProduct.set(v.product_id, list);
  }

  const imagesByProduct = new Map<string, { url: string; alt: string }[]>();
  for (const img of images ?? []) {
    const list = imagesByProduct.get(img.product_id) ?? [];
    list.push({ url: productImageUrl(img.storage_path), alt: img.alt_text || "" });
    imagesByProduct.set(img.product_id, list);
  }

  return products.map((p) => {
    const vs = variantsByProduct.get(p.id) ?? [];
    const imgs = imagesByProduct.get(p.id) ?? [];
    const prices = vs.map((v) => v.priceCents);
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const maxPrice = prices.length ? Math.max(...prices) : 0;
    const totalAvailable = stock ? vs.reduce((n, v) => n + (v.available ?? 0), 0) : null;
    const cat = p.category_id ? categoryById.get(p.category_id) : undefined;
    return {
      id: p.id,
      slug: p.slug,
      name: p.title,
      description: p.description,
      priceCents: minPrice,
      priceFrom: vs.length > 1 && minPrice !== maxPrice,
      compareAtCents: vs[0]?.compareAtCents ?? null,
      categoryId: p.category_id,
      categorySlug: cat?.slug ?? null,
      categoryName: cat?.name ?? null,
      tags: p.tags ?? [],
      variants: vs,
      images: imgs,
      imageUrl: imgs[0]?.url ?? null,
      totalAvailable,
      soldOut: stock !== null && vs.length > 0 && totalAvailable === 0,
      createdAt: p.created_at,
    };
  });
}

const PRODUCT_COLS = "id, title, slug, description, category_id, tags, created_at";

/** All published products with variants, images and (when readable) stock. */
export async function getProducts(): Promise<CatalogResult<ShopProductView[]>> {
  try {
    const client = await createShopUserClient();
    const { data, error } = await client
      .from("products")
      .select(PRODUCT_COLS)
      .eq("status", "published")
      .order("created_at", { ascending: false });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: await assemble(client, (data ?? []) as RawProduct[]) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Catalog read failed." };
  }
}

/** Published products in one category (by category slug). */
export async function getProductsByCategorySlug(slug: string): Promise<CatalogResult<{ category: ShopCategoryView | null; products: ShopProductView[] }>> {
  try {
    const client = await createShopUserClient();
    const { data: cat, error: catErr } = await client
      .from("categories")
      .select("id, name, slug")
      .eq("slug", slug)
      .maybeSingle();
    if (catErr) return { ok: false, error: catErr.message };
    if (!cat) return { ok: true, data: { category: null, products: [] } };
    const { data, error } = await client
      .from("products")
      .select(PRODUCT_COLS)
      .eq("status", "published")
      .eq("category_id", cat.id)
      .order("created_at", { ascending: false });
    if (error) return { ok: false, error: error.message };
    const products = await assemble(client, (data ?? []) as RawProduct[]);
    return {
      ok: true,
      data: {
        category: { id: cat.id, name: cat.name, slug: cat.slug, productCount: products.length },
        products,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Catalog read failed." };
  }
}

/** One published product by slug, or null when it does not exist / is not published. */
export async function getProductBySlug(slug: string): Promise<CatalogResult<ShopProductView | null>> {
  try {
    const client = await createShopUserClient();
    const { data, error } = await client
      .from("products")
      .select(PRODUCT_COLS)
      .eq("status", "published")
      .eq("slug", slug)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: true, data: null };
    const [view] = await assemble(client, [data as RawProduct]);
    return { ok: true, data: view ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Catalog read failed." };
  }
}

/** All categories with published-product counts. */
export async function getCategories(): Promise<CatalogResult<ShopCategoryView[]>> {
  try {
    const client = createShopAnonClient();
    const [{ data: categories, error }, { data: products }] = await Promise.all([
      client.from("categories").select("id, name, slug").order("name", { ascending: true }),
      client.from("products").select("id, category_id").eq("status", "published"),
    ]);
    if (error) return { ok: false, error: error.message };
    const counts = new Map<string, number>();
    for (const p of products ?? []) {
      if (p.category_id) counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
    }
    return {
      ok: true,
      data: (categories ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        productCount: counts.get(c.id) ?? 0,
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Catalog read failed." };
  }
}

/** Alias named for the deliverable (collections == categories in the DB). */
export const getCollections = getCategories;
