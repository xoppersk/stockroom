"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Minus, Plus, ShoppingBag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { addItem } from "@/lib/cart/cart";
import { formatUSD, shimmerPlaceholder } from "@/lib/shop/format";

export interface DetailVariant {
  id: string;
  title: string;
  sku: string;
  optionValues: Record<string, string>;
  price: number;
  compareAtPrice: number | null;
  stockOnHand: number;
  lowStockThreshold: number;
}

interface ProductDetailClientProps {
  product: {
    title: string;
    description: string;
    categoryName: string | null;
    categorySlug: string | null;
  };
  variants: DetailVariant[];
  images: { url: string; alt: string }[];
}

/**
 * Interactive product detail: gallery, variant option buttons, per-variant
 * stock hints, quantity stepper, and add to cart. The price, stock hint, and
 * add-to-cart availability all follow the selected variant.
 */
export function ProductDetailClient({ product, variants, images }: ProductDetailClientProps) {
  // Option groups in first-appearance order: { Size: ["S","M","L"], Color: [...] }
  const optionGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const v of variants) {
      for (const [name, value] of Object.entries(v.optionValues)) {
        const list = groups.get(name) ?? [];
        if (!list.includes(value)) list.push(value);
        groups.set(name, list);
      }
    }
    return [...groups.entries()];
  }, [variants]);

  const [selected, setSelected] = useState<Record<string, string>>(() => {
    const first = variants.find((v) => v.stockOnHand > 0) ?? variants[0];
    return first ? { ...first.optionValues } : {};
  });
  const [imageIndex, setImageIndex] = useState(0);
  const [qty, setQty] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const variant = useMemo(() => {
    if (optionGroups.length === 0) return variants[0] ?? null;
    return (
      variants.find((v) =>
        Object.entries(selected).every(([name, value]) => v.optionValues[name] === value),
      ) ?? null
    );
  }, [variants, selected, optionGroups.length]);

  const outOfStock = !variant || variant.stockOnHand === 0;
  const lowStock =
    variant !== null && variant.stockOnHand > 0 && variant.stockOnHand <= variant.lowStockThreshold;
  const maxQty = variant ? Math.min(99, variant.stockOnHand) : 1;

  function pickOption(name: string, value: string) {
    setSelected((prev) => ({ ...prev, [name]: value }));
    setQty(1);
    setError(null);
  }

  async function handleAdd() {
    if (!variant || outOfStock || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await addItem(variant.id, qty);
      // On success addItem redirects to /cart and never resolves.
      if (!result.ok) setError(result.message);
    } catch {
      setError("Could not add to cart. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const activeImage = images[imageIndex] ?? null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 pb-28 sm:px-6 md:pb-12">
      <div className="grid gap-10 md:grid-cols-2">
        {/* Gallery */}
        <div>
          <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--radius)] border border-border bg-muted">
            {activeImage ? (
              <Image
                key={activeImage.url}
                src={activeImage.url}
                alt={activeImage.alt}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
                placeholder="blur"
                blurDataURL={shimmerPlaceholder(800, 1000)}
                priority
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
                {product.title}
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div className="mt-3 grid grid-cols-5 gap-3">
              {images.map((img, i) => (
                <button
                  key={img.url}
                  type="button"
                  onClick={() => setImageIndex(i)}
                  aria-label={`View image ${i + 1}`}
                  aria-pressed={i === imageIndex}
                  className={`relative aspect-square overflow-hidden rounded-md border transition-colors ${
                    i === imageIndex ? "border-primary ring-2 ring-primary/30" : "border-border"
                  }`}
                >
                  <Image
                    src={img.url}
                    alt={img.alt}
                    fill
                    sizes="20vw"
                    className="object-cover"
                    placeholder="blur"
                    blurDataURL={shimmerPlaceholder(200, 200)}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Buy panel */}
        <div>
          {product.categoryName && (
            <Link
              href={product.categorySlug ? `/products?category=${product.categorySlug}` : "/shop"}
              className="text-xs font-medium tracking-widest text-muted-foreground uppercase hover:text-foreground"
            >
              {product.categoryName}
            </Link>
          )}
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{product.title}</h1>

          {variant && (
            <div className="mt-4 flex items-baseline gap-3">
              <p className="text-2xl font-semibold tabular-nums">{formatUSD(variant.price)}</p>
              {variant.compareAtPrice !== null && variant.compareAtPrice > variant.price && (
                <p className="text-lg text-muted-foreground line-through tabular-nums">
                  {formatUSD(variant.compareAtPrice)}
                </p>
              )}
            </div>
          )}

          <div className="mt-2 min-h-6" aria-live="polite">
            {outOfStock ? (
              <p className="text-sm font-medium text-destructive">Out of stock</p>
            ) : lowStock ? (
              <p className="text-sm font-medium text-[var(--warning)]">
                Only {variant.stockOnHand} left
              </p>
            ) : (
              <p className="text-sm font-medium text-[var(--success)]">In stock</p>
            )}
          </div>

          {optionGroups.map(([name, values]) => (
            <div key={name} className="mt-6">
              <p className="text-sm font-medium">
                {name}:{" "}
                <span className="font-normal text-muted-foreground">{selected[name]}</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={name}>
                {values.map((value) => {
                  const active = selected[name] === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => pickOption(name, value)}
                      aria-pressed={active}
                      className={`min-h-11 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card hover:border-primary/60"
                      }`}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="mt-6 hidden items-center gap-4 md:flex">
            <div className="flex items-center rounded-md border border-border">
              <button
                type="button"
                onClick={() => setQty((n) => Math.max(1, n - 1))}
                disabled={qty <= 1}
                aria-label="Decrease quantity"
                className="flex min-h-11 min-w-11 items-center justify-center disabled:opacity-40"
              >
                <Minus className="size-4" aria-hidden />
              </button>
              <span className="w-10 text-center font-medium tabular-nums" aria-live="polite">
                {qty}
              </span>
              <button
                type="button"
                onClick={() => setQty((n) => Math.min(maxQty, n + 1))}
                disabled={qty >= maxQty}
                aria-label="Increase quantity"
                className="flex min-h-11 min-w-11 items-center justify-center disabled:opacity-40"
              >
                <Plus className="size-4" aria-hidden />
              </button>
            </div>
            <Button
              size="lg"
              className="flex-1"
              disabled={outOfStock || pending}
              onClick={handleAdd}
            >
              <ShoppingBag className="size-4" aria-hidden />
              {pending ? "Adding…" : outOfStock ? "Out of stock" : "Add to cart"}
            </Button>
          </div>

          {error && (
            <p role="alert" className="mt-3 text-sm font-medium text-destructive">
              {error}
            </p>
          )}

          {product.description && (
            <div className="mt-8 border-t border-border pt-6">
              <h2 className="text-sm font-semibold tracking-wide uppercase">Details</h2>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                {product.description}
              </p>
              {variant && (
                <p className="mt-3 text-xs text-muted-foreground tabular-nums">SKU {variant.sku}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile sticky add-to-cart bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-4 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="flex items-center rounded-md border border-border">
            <button
              type="button"
              onClick={() => setQty((n) => Math.max(1, n - 1))}
              disabled={qty <= 1}
              aria-label="Decrease quantity"
              className="flex min-h-11 min-w-11 items-center justify-center disabled:opacity-40"
            >
              <Minus className="size-4" aria-hidden />
            </button>
            <span className="w-8 text-center font-medium tabular-nums">{qty}</span>
            <button
              type="button"
              onClick={() => setQty((n) => Math.min(maxQty, n + 1))}
              disabled={qty >= maxQty}
              aria-label="Increase quantity"
              className="flex min-h-11 min-w-11 items-center justify-center disabled:opacity-40"
            >
              <Plus className="size-4" aria-hidden />
            </button>
          </div>
          <Button className="flex-1" disabled={outOfStock || pending} onClick={handleAdd}>
            <ShoppingBag className="size-4" aria-hidden />
            {pending
              ? "Adding…"
              : outOfStock
                ? "Out of stock"
                : `Add to cart · ${variant ? formatUSD(variant.price * qty) : ""}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
