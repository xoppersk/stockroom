import {
  createShopAnonClient,
  productImageUrl,
  type ShopProduct,
} from "@/lib/shop/db";

/**
 * Catalog reads for the storefront. Uses the anon client so the public RLS
 * policies (published products/variants/images only) are the ones doing the
 * gating — exactly what a real shopper can see.
 */

export interface CatalogProduct {
  id: string;
  title: string;
  slug: string;
  description: string;
  categoryId: string | null;
  categoryName: string | null;
  createdAt: string;
  minPrice: number;
  maxPrice: number;
  imageUrl: string | null;
  imageAlt: string;
}

interface VariantPrice {
  product_id: string;
  price: string;
}

function priceRange(variants: VariantPrice[]): { min: number; max: number } {
  const prices = variants.map((v) => Number(v.price)).filter((n) => Number.isFinite(n));
  if (prices.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

function attachPricing(
  products: ShopProduct[],
  variants: VariantPrice[],
  images: { product_id: string; storage_path: string; alt_text: string }[],
  categoryNames: Map<string, string>,
): CatalogProduct[] {
  const variantsByProduct = new Map<string, VariantPrice[]>();
  for (const v of variants) {
    const list = variantsByProduct.get(v.product_id) ?? [];
    list.push(v);
    variantsByProduct.set(v.product_id, list);
  }
  const imageByProduct = new Map<string, { storage_path: string; alt_text: string }>();
  for (const img of images) {
    if (!imageByProduct.has(img.product_id)) {
      imageByProduct.set(img.product_id, img);
    }
  }
  return products.map((p) => {
    const { min, max } = priceRange(variantsByProduct.get(p.id) ?? []);
    const img = imageByProduct.get(p.id);
    return {
      id: p.id,
      title: p.title,
      slug: p.slug,
      description: p.description,
      categoryId: p.category_id,
      categoryName: p.category_id ? (categoryNames.get(p.category_id) ?? null) : null,
      createdAt: p.created_at,
      minPrice: min,
      maxPrice: max,
      imageUrl: img ? productImageUrl(img.storage_path) : null,
      imageAlt: img?.alt_text || p.title,
    };
  });
}

/** Published products with price ranges and cover images. */
export async function getPublishedProducts(limit?: number): Promise<CatalogProduct[]> {
  const supabase = await createShopAnonClient();
  let query = supabase
    .from("products")
    .select("id, title, slug, description, category_id, tags, status, created_by, created_at, updated_at")
    .eq("status", "published")
    .order("created_at", { ascending: false });
  if (limit !== undefined) query = query.limit(limit);
  const { data: products } = await query;
  if (!products || products.length === 0) return [];

  const ids = products.map((p) => p.id);
  const [{ data: variants }, { data: images }, { data: categories }] = await Promise.all([
    supabase.from("product_variants").select("product_id, price").in("product_id", ids),
    supabase
      .from("product_images")
      .select("product_id, storage_path, alt_text")
      .in("product_id", ids)
      .order("position", { ascending: true }),
    supabase.from("categories").select("id, name"),
  ]);
  const categoryNames = new Map((categories ?? []).map((c) => [c.id, c.name] as const));

  return attachPricing(products, variants ?? [], images ?? [], categoryNames);
}

/** All categories with their published-product counts. */
export async function getCategoriesWithCounts(): Promise<
  { id: string; name: string; slug: string; productCount: number }[]
> {
  const supabase = await createShopAnonClient();
  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase.from("categories").select("id, name, slug").order("name", { ascending: true }),
    supabase.from("products").select("id, category_id").eq("status", "published"),
  ]);
  const counts = new Map<string, number>();
  for (const p of products ?? []) {
    if (p.category_id) counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
  }
  return (categories ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    productCount: counts.get(c.id) ?? 0,
  }));
}
