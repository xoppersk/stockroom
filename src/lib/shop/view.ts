import type {
  Cart,
  CartItem,
  CartWithItems,
  Collection,
  DiscountCode,
  InventoryLevel,
  Money,
  Order,
  OrderItem,
  OrderSummary,
  ProductDetail,
  ProductImage,
  ProductListItem,
  ProductVariant,
} from "./types";

/**
 * Row → domain mappers (adapted from v1 `src/lib/shop/view.ts`).
 *
 * Centralises every assumption about Supabase row shapes so catalog.ts
 * and the admin console never touch raw rows. Money is stored as
 * decimal strings in Postgres; mappers coerce to integer minor units
 * via toMinor().
 */

export function toMinor(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function toMoney(value: string | number | null | undefined): Money {
  return { amount: toMinor(value), currency: "GBP" };
}

type ImageUrl = (path: string) => string;

function mapImage(row: any, imageUrl: ImageUrl): ProductImage {
  return {
    id: String(row.id),
    url: imageUrl(String(row.storage_path ?? row.url ?? "")),
    alt: (row.alt_text ?? row.alt ?? null) as string | null,
    position: Number(row.position ?? 0),
  };
}

function mapVariant(row: any, stockBySku?: Map<string, number>): ProductVariant {
  const sku = String(row.sku);
  return {
    id: String(row.id),
    sku,
    name: String(row.name ?? row.title ?? sku),
    price: toMoney(row.price),
    compareAtPrice:
      row.compare_at_price != null ? toMoney(row.compare_at_price) : null,
    stock: stockBySku?.get(sku) ?? 0,
    position: Number(row.position ?? 0),
    optionValues: (row.option_values ?? {}) as Record<string, string>,
  };
}

export function mapProductListRow(row: any, imageUrl: ImageUrl): ProductListItem {
  const images: ProductImage[] = Array.isArray(row.images)
    ? row.images.map((i: any) => mapImage(i, imageUrl))
    : [];
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: (row.description ?? null) as string | null,
    price: toMoney(row.min_price ?? row.price),
    compareAtPrice:
      row.min_compare_at_price != null
        ? toMoney(row.min_compare_at_price)
        : null,
    image: images[0] ?? null,
    images,
    inStock: Number(row.total_stock ?? 0) > 0,
    stock: Number(row.total_stock ?? 0),
    collectionSlug: (row.collection_slug ?? null) as string | null,
    isNew: Boolean(row.is_new ?? false),
    isFeatured: Boolean(row.is_featured ?? false),
  };
}

export function mapProductDetailRow(
  row: {
    product: any;
    images: any[];
    variants: any[];
    stockBySku: Map<string, number>;
  },
  imageUrl: ImageUrl,
): ProductDetail {
  const p = row.product;
  const images = row.images.map((i) => mapImage(i, imageUrl));
  const variants = row.variants.map((v) => mapVariant(v, row.stockBySku));
  const minPrice = variants.length
    ? variants.reduce((m, v) => Math.min(m, v.price.amount), variants[0].price.amount)
    : toMinor(p.min_price ?? p.price);
  return {
    id: String(p.id),
    slug: String(p.slug),
    name: String(p.name),
    description: (p.description ?? null) as string | null,
    price: { amount: minPrice, currency: "GBP" },
    compareAtPrice: null,
    image: images[0] ?? null,
    images,
    variants,
    inStock: variants.some((v) => v.stock > 0),
    stock: variants.reduce((n, v) => n + v.stock, 0),
    collectionSlug: (p.collection_slug ?? null) as string | null,
    isNew: Boolean(p.is_new ?? false),
    isFeatured: Boolean(p.is_featured ?? false),
  };
}

export function mapCollectionRow(row: any, imageUrl: ImageUrl): Collection {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: (row.description ?? null) as string | null,
    imageUrl: row.image_path ? imageUrl(String(row.image_path)) : null,
    productCount: Number(row.product_count ?? 0),
  };
}

function mapCartItem(row: any, imageUrl: ImageUrl): CartItem {
  const variant = row.variant ?? {};
  const product = variant.product ?? row.product ?? {};
  const images: ProductImage[] = Array.isArray(product.images)
    ? product.images.map((i: any) => mapImage(i, imageUrl))
    : [];
  return {
    id: String(row.id),
    variantId: String(row.variant_id ?? variant.id),
    productId: String(variant.product_id ?? product.id ?? ""),
    productSlug: String(product.slug ?? ""),
    name: String(product.name ?? variant.name ?? "Item"),
    variantName: (variant.name ?? null) as string | null,
    sku: String(variant.sku ?? ""),
    image: images[0] ?? null,
    unitPrice: toMinor(row.unit_price ?? variant.price),
    qty: Number(row.qty ?? row.quantity ?? 1),
  };
}

export function mapCartRow(row: any): Cart {
  return {
    id: String(row.id),
    status: String(row.status ?? "active") as Cart["status"],
    itemCount: 0,
    subtotal: { amount: 0, currency: "GBP" },
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at ?? row.created_at),
  };
}

export function mapCartWithItemsRow(row: any, imageUrl: ImageUrl): CartWithItems {
  const items: CartItem[] = Array.isArray(row.items)
    ? row.items.map((i: any) => mapCartItem(i, imageUrl))
    : [];
  const subtotal = items.reduce((n, i) => n + i.unitPrice * i.qty, 0);
  return {
    ...mapCartRow(row),
    items,
    itemCount: items.reduce((n, i) => n + i.qty, 0),
    subtotal: { amount: subtotal, currency: "GBP" },
  };
}

export function mapDiscountRow(row: any): DiscountCode {
  return {
    code: String(row.code),
    type: String(row.type ?? "percentage") as DiscountCode["type"],
    value: Number(row.value ?? 0),
    minSubtotal: toMoney(row.min_subtotal),
    startsAt: (row.starts_at ?? null) as string | null,
    endsAt: (row.ends_at ?? null) as string | null,
    usageLimit: row.usage_limit != null ? Number(row.usage_limit) : null,
    usedCount: Number(row.used_count ?? 0),
    isActive: Boolean(row.is_active ?? true),
  };
}

function mapOrderItem(row: any, imageUrl: ImageUrl): OrderItem {
  return {
    id: String(row.id),
    variantId: (row.variant_id ?? null) as string | null,
    productName: String(row.product_name ?? row.name ?? "Item"),
    variantName: (row.variant_name ?? null) as string | null,
    sku: String(row.sku ?? ""),
    image: row.image_path ? mapImage({ id: row.id, storage_path: row.image_path }, imageUrl) : null,
    unitPrice: toMinor(row.unit_price),
    qty: Number(row.qty ?? 1),
    lineTotal: toMinor(row.line_total ?? Number(row.unit_price ?? 0) * Number(row.qty ?? 1)),
  };
}

export function mapOrderRow(row: any, imageUrl: ImageUrl): Order {
  const items: OrderItem[] = Array.isArray(row.items)
    ? row.items.map((i: any) => mapOrderItem(i, imageUrl))
    : [];
  return {
    id: String(row.id),
    number: String(row.number ?? row.id.slice(0, 8)),
    status: String(row.status ?? "pending") as Order["status"],
    items,
    subtotal: toMoney(row.subtotal),
    discountTotal: toMoney(row.discount_total),
    shippingTotal: toMoney(row.shipping_total),
    taxTotal: toMoney(row.tax_total),
    total: toMoney(row.total),
    currency: String(row.currency ?? "GBP"),
    email: String(row.email ?? ""),
    shippingName: (row.shipping_name ?? null) as string | null,
    address1: (row.address1 ?? null) as string | null,
    address2: (row.address2 ?? null) as string | null,
    city: (row.city ?? null) as string | null,
    region: (row.region ?? null) as string | null,
    postalCode: (row.postal_code ?? null) as string | null,
    country: (row.country ?? null) as string | null,
    phone: (row.phone ?? null) as string | null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at ?? row.created_at),
  };
}

export function mapOrderListRow(row: any): OrderSummary {
  return {
    id: String(row.id),
    number: String(row.number ?? row.id.slice(0, 8)),
    status: String(row.status ?? "pending") as OrderSummary["status"],
    total: toMoney(row.total),
    createdAt: String(row.created_at),
    itemCount: Number(row.item_count ?? 0),
  };
}

export function mapInventoryLevelRow(row: any): InventoryLevel {
  return {
    sku: String(row.sku),
    onHand: Number(row.on_hand ?? 0),
    reserved: Number(row.reserved ?? 0),
    available: Math.max(0, Number(row.on_hand ?? 0) - Number(row.reserved ?? 0)),
    lowStockThreshold: Number(row.low_stock_threshold ?? 0),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}
