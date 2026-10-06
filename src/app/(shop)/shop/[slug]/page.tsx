import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  createShopAnonClient,
  productImageUrl,
  type Json,
} from "@/lib/shop/db";
import { ProductDetailClient, type DetailVariant } from "./product-detail-client";

interface PageProps {
  params: Promise<{ slug: string }>;
}

function optionValuesOf(value: Json): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createShopAnonClient();
  const { data } = await supabase
    .from("products")
    .select("title")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  return { title: data?.title ?? "Product" };
}

/** Product detail: gallery, variant option buttons, stock hints, add to cart. */
export default async function ProductDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createShopAnonClient();

  const { data: product } = await supabase
    .from("products")
    .select("id, title, slug, description, category_id")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (!product) notFound();

  const [{ data: variants }, { data: images }, { data: category }] =
    await Promise.all([
      supabase
        .from("product_variants")
        .select("id, title, sku, option_values, price, compare_at_price, position")
        .eq("product_id", product.id)
        .order("position", { ascending: true }),
      supabase
        .from("product_images")
        .select("storage_path, alt_text")
        .eq("product_id", product.id)
        .order("position", { ascending: true }),
      product.category_id
        ? supabase
            .from("categories")
            .select("name, slug")
            .eq("id", product.category_id)
            .maybeSingle()
        : Promise.resolve({ data: null as { name: string; slug: string } | null }),
    ]);

  const variantIds = (variants ?? []).map((v) => v.id);
  const { data: invRows } = variantIds.length
    ? await supabase
        .from("inventory_levels")
        .select("variant_id, quantity_on_hand, low_stock_threshold")
        .in("variant_id", variantIds)
    : { data: [] as { variant_id: string; quantity_on_hand: number; low_stock_threshold: number }[] };

  const stockByVariant = new Map(
    (invRows ?? []).map((r) => [r.variant_id, r] as const),
  );

  const detailVariants: DetailVariant[] = (variants ?? []).map((v) => {
    const stock = stockByVariant.get(v.id);
    return {
      id: v.id,
      title: v.title,
      sku: v.sku,
      optionValues: optionValuesOf(v.option_values),
      price: Number(v.price),
      compareAtPrice: v.compare_at_price === null ? null : Number(v.compare_at_price),
      stockOnHand: stock?.quantity_on_hand ?? 0,
      lowStockThreshold: stock?.low_stock_threshold ?? 0,
    };
  });

  return (
    <ProductDetailClient
      product={{
        title: product.title,
        description: product.description,
        categoryName: category?.name ?? null,
        categorySlug: category?.slug ?? null,
      }}
      variants={detailVariants}
      images={(images ?? []).map((img) => ({
        url: productImageUrl(img.storage_path),
        alt: img.alt_text || product.title,
      }))}
    />
  );
}
