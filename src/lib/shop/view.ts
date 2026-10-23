/**
 * Pure view models + presentation helpers for the storefront.
 * No server imports — safe for Client Components. The server data layer
 * (catalog.ts) maps DB rows into these shapes.
 */

export interface ShopVariantView {
  id: string;
  title: string;
  sku: string;
  /** First option value (e.g. colour) — the v2 swatch label. */
  colour: string;
  /** Full option map, e.g. { Color: "Terracotta", Size: "Large" }. */
  options: Record<string, string>;
  priceCents: number;
  compareAtCents: number | null;
  /** Units on hand, or null when stock is not readable in this env. */
  available: number | null;
  lowStockThreshold: number | null;
}

export interface ShopProductView {
  id: string;
  slug: string;
  name: string;
  description: string;
  priceCents: number; // from-price (min variant price)
  priceFrom: boolean;
  compareAtCents: number | null;
  categoryId: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  tags: string[];
  variants: ShopVariantView[];
  images: { url: string; alt: string }[];
  imageUrl: string | null;
  /** Total available across variants; null when stock is unknown. */
  totalAvailable: number | null;
  /** True when stock is known and every variant is at 0. */
  soldOut: boolean;
  createdAt: string;
}

export interface ShopCategoryView {
  id: string;
  name: string;
  slug: string;
  productCount: number;
}

const PALETTE = ["#3A3530", "#D9D0C1", "#9A4E2E", "#ECE9E3", "#6B7F6A", "#C9B79A", "#8C5A3C", "#E8D5A8", "#A57B4F", "#57534E"];

/** Deterministic placeholder colour for a product (photos are placeholders in the v2 design). */
export function placeholderBg(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

export function isDarkBg(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 140;
}

/** Swatch hex for a colour name (design palette; unknown names get a hash pick). */
const COLOUR_HEX: Record<string, string> = {
  charcoal: "#3A3530",
  natural: "#D9D0C1",
  rust: "#9A4E2E",
  white: "#ECE9E3",
  oat: "#D9D0C1",
  terracotta: "#9A4E2E",
  moss: "#6B7F6A",
  sage: "#6B7F6A",
  oak: "#A57B4F",
  walnut: "#8C5A3C",
  brass: "#A57B4F",
  black: "#1C1917",
};

export function colourHex(name: string): string {
  return COLOUR_HEX[name.toLowerCase()] ?? placeholderBg(name);
}
