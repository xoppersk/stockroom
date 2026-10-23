/* C-04 Products (+ X-05 empty catalog) — screens/Products.html.
 * Server component: the catalog is read via @/lib/shop/admin
 * (session client, staff RLS — drafts and archived included) and
 * mapped to row view models for the client island. Tab counts,
 * collections and the summary totals all derive from the real
 * catalog via @/lib/derive — the fixture build's CANON rows and
 * hard-coded counts (38 / 96 / 18 / 1) are gone. */

import { listConsoleProducts } from "@/lib/shop/admin";
import { availableOf, inventorySummary, isBelowReorder, listSkus } from "@/lib/derive";
import { isDarkBg, placeholderBg } from "@/lib/shop/view";
import { money } from "@/lib/format";
import type { Product } from "@/lib/types";
import ProductsClient, { type ProductRow, type ProductTab } from "./ProductsClient";
import "@/styles/console-core.css";

function initialsOf(name: string): string {
  const words = name.replace(/[^A-Za-z ]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "··";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

function toRow(p: Product): ProductRow {
  const variants = p.variants.map((v) => ({
    label: v.label,
    sku: v.sku,
    available: availableOf(v),
    reorderPoint: v.reorderPoint,
    countPending: v.countPending,
  }));
  const prices = p.variants.map((v) => v.priceCents);
  const priceFrom = prices.length > 1 && Math.min(...prices) !== Math.max(...prices);
  const soldOutVariants = variants.filter((v) => v.available <= 0).length;
  const storefront =
    typeof p.storefront === "string" && p.storefront.length > 0
      ? p.storefront
      : p.status === "active"
        ? soldOutVariants > 0
          ? `Visible, ${soldOutVariants} sold out`
          : "Visible"
        : "Hidden";
  const bg = placeholderBg(p.slug);
  return {
    slug: p.slug,
    initials: initialsOf(p.name),
    thumbBg: bg,
    thumbColor: isDarkBg(bg) ? "#FFFFFF" : "var(--ink)",
    name: p.name,
    collection: p.collection,
    meta: `${p.variants.length} variant${p.variants.length === 1 ? "" : "s"} · ${p.collection}`,
    statusLabel: p.status === "active" ? "Active" : p.status === "draft" ? "Draft" : "Archived",
    statusTone: p.status === "active" ? "paid" : "muted",
    statusKey: p.status,
    needsRestock: p.status !== "archived" && p.variants.some(isBelowReorder),
    variants,
    priceLabel: priceFrom ? `from ${money(p.priceCents)}` : money(p.priceCents),
    priceCents: p.priceCents,
    sold: typeof p.sold30d === "number" ? p.sold30d : null,
    storefront,
    mutedRow: p.status === "archived",
  };
}

export default async function ProductsPage() {
  const products = await listConsoleProducts();
  const rows = products.map(toRow);
  const skus = listSkus(products);
  const summary = inventorySummary(skus, 0);

  const tabs: ProductTab[] = [
    { key: "all", label: "All", count: products.length, countCls: "cc-cnt-ink" },
    { key: "active", label: "Active", count: products.filter((p) => p.status === "active").length, countCls: "cc-cnt-soft" },
    { key: "draft", label: "Draft", count: products.filter((p) => p.status === "draft").length, countCls: "cc-cnt-soft" },
    { key: "archived", label: "Archived", count: products.filter((p) => p.status === "archived").length, countCls: "cc-cnt-soft" },
    { key: "restock", label: "Needs restock", count: rows.filter((r) => r.needsRestock).length, countCls: "cc-cnt-tape" },
  ];
  const collections = [...new Set(products.map((p) => p.collection).filter(Boolean))].sort();

  return (
    <ProductsClient
      rows={rows}
      tabs={tabs}
      collections={collections}
      totals={{
        products: products.length,
        skus: skus.length,
        belowReorder: summary.belowReorder,
        soldOut: summary.atZero,
      }}
    />
  );
}
