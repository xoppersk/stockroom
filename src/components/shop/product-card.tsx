import Image from "next/image";
import Link from "next/link";
import { Image as ImageIcon } from "lucide-react";

import { formatUSD, shimmerPlaceholder } from "@/lib/shop/format";

export interface ProductCardData {
  slug: string;
  title: string;
  categoryName: string | null;
  minPrice: number;
  maxPrice: number;
  imageUrl: string | null;
  imageAlt: string;
}

/**
 * Storefront product card (Flagship UI Designs §2.15): 4:5 imagery, 16px
 * semibold title, 16px semibold tabular price range, warm-neutral icon tile
 * when there is no image (never a broken-image icon).
 */
export function ProductCard({ product }: { product: ProductCardData }) {
  const priceLabel =
    product.minPrice === product.maxPrice
      ? formatUSD(product.minPrice)
      : `${formatUSD(product.minPrice)} – ${formatUSD(product.maxPrice)}`;

  return (
    <Link
      href={`/shop/${product.slug}`}
      className="group block overflow-hidden rounded-[var(--radius)] border border-border bg-card transition-shadow hover:shadow-[0_1px_2px_rgb(28_25_23/0.06),0_8px_24px_-12px_rgb(28_25_23/0.25)]"
    >
      <div className="relative aspect-[4/5] bg-[#efe9df]">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.imageAlt}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            placeholder="blur"
            blurDataURL={shimmerPlaceholder(600, 750)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center border border-border bg-[#efe9df]">
            <ImageIcon className="size-8 text-muted-foreground" aria-label={product.title} />
          </div>
        )}
      </div>
      <div className="p-4">
        {product.categoryName && (
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            {product.categoryName}
          </p>
        )}
        <h3 className="mt-1 text-base leading-6 font-semibold tracking-tight group-hover:underline">
          {product.title}
        </h3>
        <p className="mt-1 text-base font-semibold tabular-nums">{priceLabel}</p>
      </div>
    </Link>
  );
}
