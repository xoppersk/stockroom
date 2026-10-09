import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { currentRole } from "@/lib/auth/roles";
import { createProductsClient } from "@/lib/products/types";
import { optionKey } from "@/lib/products/utils";
import {
  ProductEditor,
  type EditorVariant,
  type HistoryEntry,
} from "@/components/products/product-editor";

export const metadata: Metadata = { title: "Product" };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tabbed product editor. All staff can view; only admins get editing controls
 * (the server actions re-check the role, the UI just hides the buttons).
 * The Inventory tab is read-only for everyone — stock moves belong to the
 * inventory team — and History reads `audit_log`, which is admin-readable.
 */
export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();

  const role = await currentRole();
  const isAdmin = role === "admin";

  const supabase = await createProductsClient();

  const { data: product } = await supabase
    .from("products")
    .select("*, categories(id, name), product_variants(*, inventory_levels(*)), product_images(*)")
    .eq("id", id)
    .order("position", { referencedTable: "product_variants", ascending: true })
    .order("position", { referencedTable: "product_images", ascending: true })
    .maybeSingle();

  if (!product) notFound();

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .order("name");

  const variants: EditorVariant[] = (product.product_variants ?? []).map((v) => ({
    key: optionKey(v.option_values),
    id: v.id,
    optionValues: v.option_values,
    title: v.title,
    sku: v.sku,
    price: v.price,
    compareAtPrice: v.compare_at_price ?? "",
    quantity: String(v.inventory_levels?.quantity_on_hand ?? 0),
    threshold: String(v.inventory_levels?.low_stock_threshold ?? 10),
    stock: v.inventory_levels
      ? {
          quantity: v.inventory_levels.quantity_on_hand,
          threshold: v.inventory_levels.low_stock_threshold,
        }
      : null,
  }));

  // Keep the raw storage path for round-tripping through setProductImages;
  // resolveImageUrl handles display (full URLs pass through, bucket paths resolve).
  const images = (product.product_images ?? []).map((img) => ({
    url: img.storage_path,
    alt: img.alt_text,
  }));

  let history: HistoryEntry[] = [];
  if (isAdmin) {
    const variantIds = variants.flatMap((v) => (v.id ? [v.id] : []));
    let historyQuery = supabase
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    historyQuery =
      variantIds.length > 0
        ? historyQuery.or(
            `and(table_name.eq.products,row_id.eq.${id}),and(table_name.eq.product_variants,row_id.in.(${variantIds.join(",")}))`,
          )
        : historyQuery.or(`and(table_name.eq.products,row_id.eq.${id})`);
    const { data: auditRows } = await historyQuery;

    const actorIds = [...new Set((auditRows ?? []).flatMap((r) => (r.actor_id ? [r.actor_id] : [])))];
    let actorNames: Record<string, string> = {};
    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", actorIds);
      actorNames = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name]));
    }

    history = (auditRows ?? []).map((r) => ({
      id: r.id,
      action: r.action,
      tableName: r.table_name,
      createdAt: r.created_at,
      actorName: r.actor_id ? (actorNames[r.actor_id] ?? null) : null,
      before: r.before,
      after: r.after,
    }));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link
          href="/products"
          className="flex size-9 items-center justify-center rounded-md border text-muted-foreground hover:text-foreground"
          aria-label="Back to products"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-semibold tracking-tight">{product.title}</h1>
          <p className="font-mono text-xs text-muted-foreground">{product.slug}</p>
        </div>
      </div>

      <ProductEditor
        product={{
          id: product.id,
          title: product.title,
          slug: product.slug,
          description: product.description,
          categoryId: product.category_id,
          tags: product.tags,
          status: product.status,
          updatedAt: product.updated_at,
        }}
        categories={categories ?? []}
        variants={variants}
        images={images}
        history={history}
        isAdmin={isAdmin}
      />
    </div>
  );
}
