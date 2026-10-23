import {
  CART_COOKIE,
  createShopAnonClient,
  createShopServiceClient,
  createShopUserClient,
  getSessionUserId,
  productImageUrl,
  type ShopClient,
} from "./db";
import {
  mapCartRow,
  mapCartWithItemsRow,
  mapCollectionRow,
  mapDiscountRow,
  mapInventoryLevelRow,
  mapOrderListRow,
  mapOrderRow,
  mapProductDetailRow,
  mapProductListRow,
} from "./view";
import type {
  Cart,
  CartWithItems,
  Collection,
  DiscountCode,
  InventoryLevel,
  Order,
  OrderSummary,
  Paginated,
  ProductDetail,
  ProductListItem,
} from "./types";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";

/**
 * Public catalog/cart/order read model (adapted from v1
 * `src/lib/shop/catalog.ts`).
 *
 * Read strategy per table:
 * - products/product_images/variants/collections (published storefront
 *   reads): anon client when signed out (RLS SELECT on *_published
 *   views), user client when signed in. When the caller explicitly
 *   needs stock numbers (cart page, product page), the service client
 *   joins inventory_levels — inventory has no anon grant.
 * - carts/cart_items: service client (guest-token RLS cannot be
 *   satisfied from the anon key; see db.ts). Every query is scoped by
 *   the guest token or user id.
 * - discount_codes: service client, code-scoped queries.
 * - orders: user client for the customer's own list; service client for
 *   guest-token reads.
 *
 * Product images resolve via productImageUrl() (public
 * `product-images` bucket, see 00010_storage_realtime).
 */

const PAGE_SIZE = 24;

export type SortKey =
  | "featured"
  | "newest"
  | "price-asc"
  | "price-desc"
  | "name-asc";

export interface ProductFilters {
  q?: string;
  collection?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  sort?: SortKey;
  page?: number;
}

/** Signed-in → user client (RLS as the caller); signed out → anon client. */
async function readerClient(): Promise<ShopClient> {
  const userId = await getSessionUserId().catch(() => null);
  if (userId) return createShopUserClient();
  return createShopAnonClient();
}

function orderByFor(sort: SortKey | undefined): {
  column: string;
  ascending: boolean;
} {
  switch (sort) {
    case "price-asc":
      return { column: "min_price", ascending: true };
    case "price-desc":
      return { column: "min_price", ascending: false };
    case "name-asc":
      return { column: "name", ascending: true };
    case "newest":
      return { column: "created_at", ascending: false };
    case "featured":
    default:
      return { column: "created_at", ascending: false };
  }
}

export async function listProducts(
  filters: ProductFilters = {},
): Promise<Paginated<ProductListItem>> {
  const client = await readerClient();
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { column, ascending } = orderByFor(filters.sort);

  let query = client
    .from("products_published")
    .select("*", { count: "exact" });

  if (filters.q) {
    const term = filters.q.replace(/[%_]/g, "");
    query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
  }
  if (filters.collection) query = query.eq("collection_slug", filters.collection);
  if (filters.minPrice != null) query = query.gte("min_price", filters.minPrice);
  if (filters.maxPrice != null) query = query.lte("min_price", filters.maxPrice);
  if (filters.inStockOnly) query = query.gt("total_stock", 0);

  const { data, count, error } = await query
    .order(column, { ascending })
    .range(from, to);
  if (error) throw new Error(`Catalog query failed: ${error.message}`);

  return {
    items: (data ?? []).map((row) =>
      mapProductListRow(row as Parameters<typeof mapProductListRow>[0], productImageUrl),
    ),
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  };
}

export async function listCollections(): Promise<Collection[]> {
  const client = await readerClient();
  const { data, error } = await client
    .from("collections_published")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`Collections query failed: ${error.message}`);
  return (data ?? []).map((row) =>
    mapCollectionRow(row as Parameters<typeof mapCollectionRow>[0], productImageUrl),
  );
}

export async function getCollectionWithProducts(
  slug: string,
  filters: Omit<ProductFilters, "collection"> = {},
): Promise<{ collection: Collection; products: Paginated<ProductListItem> } | null> {
  const collection = await getCollection(slug);
  if (!collection) return null;
  const products = await listProducts({ ...filters, collection: slug });
  return { collection, products };
}

export async function getCollection(slug: string): Promise<Collection | null> {
  const client = await readerClient();
  const { data, error } = await client
    .from("collections_published")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`Collection query failed: ${error.message}`);
  if (!data) return null;
  return mapCollectionRow(
    data as Parameters<typeof mapCollectionRow>[0],
    productImageUrl,
  );
}

export async function getProduct(slug: string): Promise<ProductDetail | null> {
  const client = await readerClient();
  const svc = createShopServiceClient();

  const { data, error } = await client
    .from("products_published")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`Product query failed: ${error.message}`);
  if (!data) return null;

  // Images + variants from the published views (anon-safe).
  const [{ data: images }, { data: variants }] = await Promise.all([
    client
      .from("product_images_published")
      .select("*")
      .eq("product_id", data.id)
      .order("position", { ascending: true }),
    client
      .from("product_variants_published")
      .select("*")
      .eq("product_id", data.id)
      .order("position", { ascending: true }),
  ]);

  // Stock levels need the service role (no anon grant).
  let stockBySku = new Map<string, number>();
  if (svc && variants && variants.length > 0) {
    const skus = variants.map((v) => v.sku).filter(Boolean) as string[];
    if (skus.length > 0) {
      const { data: levels } = await svc
        .from("inventory_levels")
        .select("sku,on_hand,reserved")
        .in("sku", skus);
      for (const row of levels ?? []) {
        stockBySku.set(row.sku, Math.max(0, row.on_hand - row.reserved));
      }
    }
  }

  return mapProductDetailRow(
    {
      product: data as Parameters<typeof mapProductDetailRow>[0]["product"],
      images: (images ?? []) as Parameters<typeof mapProductDetailRow>[0]["images"],
      variants: (variants ?? []) as Parameters<typeof mapProductDetailRow>[0]["variants"],
      stockBySku,
    },
    productImageUrl,
  );
}

export async function getProductById(id: string): Promise<ProductDetail | null> {
  const client = await readerClient();
  const { data, error } = await client
    .from("products_published")
    .select("slug")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return getProduct(data.slug);
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

interface CartIdentity {
  guestToken: string | null;
  userId: string | null;
}

async function cartIdentity(): Promise<CartIdentity> {
  const cookieStore = await cookies();
  const userId = await getSessionUserId().catch(() => null);
  const guestToken = cookieStore.get(CART_COOKIE)?.value ?? null;
  return { guestToken, userId };
}

/** Ensure a guest token exists; returns it (sets the cookie when missing). */
export async function ensureGuestToken(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(CART_COOKIE)?.value;
  if (existing) return existing;
  const token = randomUUID();
  cookieStore.set(CART_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return token;
}

export async function getActiveCart(): Promise<CartWithItems | null> {
  const svc = createShopServiceClient();
  if (!svc) return null;
  const { guestToken, userId } = await cartIdentity();
  if (!guestToken && !userId) return null;

  let query = svc.from("carts").select("*,items:cart_items(*)");
  if (userId) query = query.eq("user_id", userId);
  else query = query.eq("guest_token", guestToken!);

  const { data, error } = await query
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Cart query failed: ${error.message}`);
  if (!data) return null;
  return mapCartWithItemsRow(
    data as Parameters<typeof mapCartWithItemsRow>[0],
    productImageUrl,
  );
}

export async function getCartCount(): Promise<number> {
  const cart = await getActiveCart();
  return cart?.items.reduce((n, i) => n + i.qty, 0) ?? 0;
}

// ---------------------------------------------------------------------------
// Discounts (public validation)
// ---------------------------------------------------------------------------

export async function validateDiscountCode(
  code: string,
): Promise<DiscountCode | null> {
  const svc = createShopServiceClient();
  if (!svc) return null;
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const { data, error } = await svc
    .from("discount_codes")
    .select("*")
    .eq("code", normalized)
    .eq("is_active", true)
    .maybeSingle();
  if (error || !data) return null;
  const now = new Date();
  if (data.starts_at && new Date(data.starts_at) > now) return null;
  if (data.ends_at && new Date(data.ends_at) < now) return null;
  return mapDiscountRow(data as Parameters<typeof mapDiscountRow>[0]);
}

// ---------------------------------------------------------------------------
// Orders (customer reads)
// ---------------------------------------------------------------------------

export async function listMyOrders(): Promise<OrderSummary[]> {
  const userId = await getSessionUserId().catch(() => null);
  const client = userId ? await createShopUserClient() : createShopAnonClient();
  if (!userId) return [];
  const { data, error } = await client
    .from("orders")
    .select("id,number,status,total,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Orders query failed: ${error.message}`);
  return (data ?? []).map((row) =>
    mapOrderListRow(row as Parameters<typeof mapOrderListRow>[0]),
  );
}

export async function getOrder(id: string): Promise<Order | null> {
  const svc = createShopServiceClient();
  const userId = await getSessionUserId().catch(() => null);

  // Signed-in customers read their own order through RLS.
  if (userId) {
    const client = await createShopUserClient();
    const { data, error } = await client
      .from("orders")
      .select("*,items:order_items(*)")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(`Order query failed: ${error.message}`);
    if (data)
      return mapOrderRow(data as Parameters<typeof mapOrderRow>[0], productImageUrl);
  }

  // Guest receipt page: service client scoped by the cart cookie token.
  if (!svc) return null;
  const { guestToken } = await cartIdentity();
  if (!guestToken) return null;
  const { data, error } = await svc
    .from("orders")
    .select("*,items:order_items(*)")
    .eq("id", id)
    .eq("guest_token", guestToken)
    .maybeSingle();
  if (error) throw new Error(`Order query failed: ${error.message}`);
  if (!data) return null;
  return mapOrderRow(data as Parameters<typeof mapOrderRow>[0], productImageUrl);
}

export async function getInventoryLevels(
  skus: string[],
): Promise<InventoryLevel[]> {
  const svc = createShopServiceClient();
  if (!svc || skus.length === 0) return [];
  const { data, error } = await svc
    .from("inventory_levels")
    .select("*")
    .in("sku", skus);
  if (error) throw new Error(`Inventory query failed: ${error.message}`);
  return (data ?? []).map((row) =>
    mapInventoryLevelRow(row as Parameters<typeof mapInventoryLevelRow>[0]),
  );
}
