/* C-05 Product editor — screens/ProductEditor.html.
 * Server component: the product is read via @/lib/shop/admin
 * getConsoleProduct(slug) (all statuses — staff RLS) and mapped to
 * the editor view model. Unknown slugs get an honest not-found
 * panel; the fixture build silently showed the canonical
 * linen-apron editor for every slug. */

import Link from "next/link";
import { getConsoleProduct, listConsoleProducts } from "@/lib/shop/admin";
import type { Product } from "@/lib/types";
import ProductEditorClient, { type EditorProduct } from "./ProductEditorClient";
import "@/styles/console-core.css";

type WithId = { id?: string; uuid?: string; variantId?: string };

function resolveProductId(p: Product): string {
  const x = p as Product & WithId;
  return x.id ?? x.uuid ?? p.slug;
}

function toEditorProduct(p: Product): EditorProduct {
  const first = p.variants[0];
  const withCompare = p.variants as unknown as Array<
    Product["variants"][number] & { compareAtCents?: number | null }
  >;
  return {
    id: resolveProductId(p),
    slug: p.slug,
    name: p.name,
    description: p.description ?? "",
    status: p.status,
    collection: p.collection,
    supplier: p.supplier,
    backorder: p.backorder,
    sold30d: p.sold30d,
    priceCents: p.priceCents,
    compareAtCents: withCompare[0]?.compareAtCents ?? null,
    costCents: first?.costCents ?? null,
    variants: p.variants.map((v) => {
      const x = v as typeof v & WithId;
      return {
        id: x.variantId ?? x.id ?? x.uuid ?? v.sku,
        sku: v.sku,
        label: v.label,
        onHand: v.onShelf,
        reorderPoint: v.reorderPoint,
        priceCents: v.priceCents,
        shelf: v.shelf ?? "",
      };
    }),
  };
}

export default async function ProductEditorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [product, allProducts] = await Promise.all([
    getConsoleProduct(slug),
    listConsoleProducts(),
  ]);
  const collections = [...new Set(allProducts.map((p) => p.collection).filter(Boolean))].sort();

  if (!product) {
    return (
      <>
        <section className="cc-task-band">
          <div className="cc-band-stack">
            <Link href="/admin/products" className="cc-backlink">← Products</Link>
            <h1 className="cc-h1">Product not found</h1>
            <span className="cc-sub">
              No product with the slug “{slug}” exists in the catalog.
            </span>
          </div>
        </section>
        <div className="sr-page">
          <section className="cc-panel" style={{ padding: "18px 20px" }}>
            <Link href="/admin/products" style={{ fontSize: 13, fontWeight: 600 }}>
              ← Back to products
            </Link>
          </section>
        </div>
      </>
    );
  }

  return <ProductEditorClient product={toEditorProduct(product)} collections={collections} />;
}
