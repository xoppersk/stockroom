import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ProductCard } from "@/components/shop/product-card";
import { getCategoriesWithCounts, getPublishedProducts } from "@/lib/shop/catalog";
import { ShopFilters, type SortKey } from "./filters";

export const metadata: Metadata = { title: "Shop all" };

interface SearchParams {
  q?: string;
  category?: string;
  min?: string;
  max?: string;
  sort?: string;
}

const SORT_KEYS: SortKey[] = ["newest", "price_asc", "price_desc"];

/** Product listing: search, category filter, price filter, sort. */
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const categorySlug = sp.category ?? "";
  const min = sp.min ? Number(sp.min) : null;
  const max = sp.max ? Number(sp.max) : null;
  const sort: SortKey = SORT_KEYS.includes(sp.sort as SortKey)
    ? (sp.sort as SortKey)
    : "newest";

  const [categories, products] = await Promise.all([
    getCategoriesWithCounts(),
    getPublishedProducts(),
  ]);

  const categoryId =
    categories.find((c) => c.slug === categorySlug)?.id ?? null;
  const activeCategoryName =
    categories.find((c) => c.slug === categorySlug)?.name ?? null;

  let filtered = products.filter((p) => {
    if (categoryId && p.categoryId !== categoryId) return false;
    if (q) {
      const haystack = `${p.title} ${p.description}`.toLowerCase();
      if (!haystack.includes(q.toLowerCase())) return false;
    }
    // Price range intersects the product's variant price range.
    if (min !== null && Number.isFinite(min) && p.maxPrice < min) return false;
    if (max !== null && Number.isFinite(max) && p.minPrice > max) return false;
    return true;
  });

  filtered = [...filtered].sort((a, b) => {
    if (sort === "price_asc") return a.minPrice - b.minPrice;
    if (sort === "price_desc") return b.maxPrice - a.maxPrice;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">
        {activeCategoryName ?? "Shop all"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground tabular-nums">
        {filtered.length} product{filtered.length === 1 ? "" : "s"}
        {q && (
          <>
            {" "}matching <span className="font-medium text-foreground">“{q}”</span>
          </>
        )}
      </p>

      <div className="mt-6">
        <Suspense>
          <ShopFilters
            categories={categories
              .filter((c) => c.productCount > 0)
              .map((c) => ({ slug: c.slug, name: c.name }))}
            initial={{
              q,
              category: categorySlug,
              min: sp.min ?? "",
              max: sp.max ?? "",
              sort,
            }}
          />
        </Suspense>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-10 rounded-[var(--radius)] border border-border bg-card p-10 text-center">
          <p className="font-display font-semibold">
            {q ? `Nothing matches “${q}”` : "Nothing here yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {q ? "Try a different search or browse a category." : "Try a different category."}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/shop"
              className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-medium hover:border-primary/50"
            >
              Clear search
            </Link>
            {categories
              .filter((c) => c.productCount > 0)
              .slice(0, 4)
              .map((c) => (
                <Link
                  key={c.id}
                  href={`/shop?category=${encodeURIComponent(c.slug)}`}
                  className="inline-flex min-h-11 items-center rounded-full bg-muted px-4 text-sm font-medium hover:bg-muted/70"
                >
                  {c.name}
                </Link>
              ))}
          </div>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
