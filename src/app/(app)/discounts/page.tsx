import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/shop/product-card";
import { getCategoriesWithCounts, getPublishedProducts } from "@/lib/shop/catalog";

export const metadata: Metadata = {
  title: "Juniper Supply Co. — Home & Lifestyle Goods",
};

/** Storefront home: hero, featured categories, featured products. */
export default async function ShopHomePage() {
  const [categories, products] = await Promise.all([
    getCategoriesWithCounts(),
    getPublishedProducts(8),
  ]);
  const featuredCategories = categories.filter((c) => c.productCount > 0).slice(0, 4);

  return (
    <div>
      {/* Hero — compact: headline + one CTA (Flagship UI Designs §2.15) */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h1 className="max-w-2xl font-display text-[32px] leading-[40px] font-semibold tracking-tight">
            Good goods for home &amp; life.
          </h1>
          <div className="mt-8">
            <Button asChild size="lg">
              <Link href="/shop">
                Shop the collection <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Featured categories */}
      {featuredCategories.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl font-semibold tracking-tight">Shop by category</h2>
            <Link
              href="/shop"
              className="text-sm font-medium text-primary hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {featuredCategories.map((category) => (
              <Link
                key={category.id}
                href={`/shop?category=${encodeURIComponent(category.slug)}`}
                className="group rounded-[var(--radius)] border border-border bg-card p-6 transition-shadow hover:shadow-[0_1px_2px_rgb(28_25_23/0.06),0_8px_24px_-12px_rgb(28_25_23/0.25)]"
              >
                <h3 className="font-medium tracking-tight group-hover:underline">
                  {category.name}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                  {category.productCount} product{category.productCount === 1 ? "" : "s"}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured products */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl font-semibold tracking-tight">Featured products</h2>
          <Link
            href="/shop"
            className="text-sm font-medium text-primary hover:underline"
          >
            View all
          </Link>
        </div>
        {products.length === 0 ? (
          <p className="mt-6 rounded-[var(--radius)] border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            New arrivals are on their way — check back soon.
          </p>
        ) : (
          <div className="mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 sm:gap-6 lg:grid-cols-4">
            {products.map((product) => (
              <div key={product.id} className="w-44 shrink-0 snap-start sm:w-auto">
                <ProductCard product={product} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
