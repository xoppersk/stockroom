import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BedDouble, Coffee, LampWallDown, UtensilsCrossed } from "lucide-react";

import { STOREFRONT_HOME } from "@/lib/truth-ledger";

export const metadata: Metadata = {
  title: "Juniper Supply Co. — Home & Lifestyle Goods",
};

const CATEGORY_BLURBS: Record<string, string> = {
  Kitchen: "Cook, serve & gather",
  Bedroom: "Rest & softness",
  Bathroom: "Daily rituals",
  "Living room": "Sit & stay awhile",
  Tabletop: "Set the table",
};

const HIGHLIGHT_ART = [
  { icon: Coffee, tone: "bg-[#e9dfc9] text-[#7c5a2e]" },
  { icon: LampWallDown, tone: "bg-[#dfd2b8] text-[#7c5a2e]" },
  { icon: BedDouble, tone: "bg-[#e5d6bd] text-[#7c5a2e]" },
  { icon: UtensilsCrossed, tone: "bg-[#e2d3b4] text-[#7c5a2e]" },
] as const;

/**
 * Juniper Supply Co. storefront home (Flagship UI Designs brief): cream and
 * beige surfaces, brown/amber accents, "Home & Lifestyle Goods" hero, five
 * featured categories, and the four highlight products with right-aligned
 * money. All facts come from src/lib/truth-ledger.ts.
 */
export default function ShopHomePage() {
  return (
    <div className="bg-[#faf9f7]">
      {/* Hero */}
      <section className="border-b border-[#e7e2dc] bg-[#f5f1e8]">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#92400e]">
            {STOREFRONT_HOME.brand}
          </p>
          <h1 className="mt-3 max-w-2xl font-display text-[34px] font-medium leading-[34px] tracking-[-0.02em] text-[#1c1917] sm:text-[44px] sm:leading-[44px]">
            {STOREFRONT_HOME.hero}
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-[25px] text-[#57534e]">
            Thoughtfully made goods for every room — stocked, packed, and
            shipped with care from our Philadelphia warehouse.
          </p>
          <div className="mt-8">
            <Link
              href="/shop"
              className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-[#d97706] px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[#b45309]"
            >
              Shop the collection <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* Featured categories */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[22px] font-semibold leading-[26px] text-[#1c1917]">
            Shop by room
          </h2>
          <Link
            href="/shop"
            className="text-sm font-medium text-[#92400e] hover:underline"
          >
            View all
          </Link>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {STOREFRONT_HOME.categories.map((category) => (
            <Link
              key={category}
              href="/shop"
              className="group rounded-[10px] border border-[#e7e2dc] bg-[#fffdf8] p-6 transition-colors hover:border-[#d97706]"
            >
              <h3 className="font-display text-[15px] font-semibold text-[#1c1917] group-hover:underline">
                {category}
              </h3>
              <p className="mt-1 text-[13px] text-[#57534e]">
                {CATEGORY_BLURBS[category]}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* Highlights */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[22px] font-semibold leading-[26px] text-[#1c1917]">
            Highlights
          </h2>
          <Link
            href="/shop"
            className="text-sm font-medium text-[#92400e] hover:underline"
          >
            View all
          </Link>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {STOREFRONT_HOME.highlights.map((product, i) => {
            const art = HIGHLIGHT_ART[i % HIGHLIGHT_ART.length]!;
            const Icon = art.icon;
            return (
              <Link
                key={product.name}
                href="/shop"
                className="group overflow-hidden rounded-[10px] border border-[#e7e2dc] bg-[#fffdf8] transition-colors hover:border-[#d97706]"
              >
                <div
                  className={`grid aspect-square place-items-center ${art.tone}`}
                  aria-hidden
                >
                  <Icon className="size-10" strokeWidth={1.5} />
                </div>
                <div className="flex items-baseline justify-between gap-2 p-4">
                  <h3 className="text-[15px] font-medium leading-snug text-[#1c1917] group-hover:underline">
                    {product.name}
                  </h3>
                  <p className="tnum shrink-0 font-mono text-[15px] font-medium text-[#1c1917]">
                    {product.price}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
