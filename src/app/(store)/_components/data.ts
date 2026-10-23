/* Storefront display types + presentation constants ONLY.
 *
 * W-SHOP (2026-10-22): the fixture catalogue that used to live here
 * (COLLECTIONS, KITCHEN_TEXTILES, ALL_PRODUCTS, APRON/MUG/NAPKIN_VARIANTS,
 * DEMO_CART, CART_DISPLAY) was removed — the catalog, cart and orders now
 * come from Supabase via src/lib/shop/*. The view-model types below mirror
 * src/lib/shop/catalog.ts so components keep a stable shape.
 *
 * SHIPPING_OPTIONS / TAX_RATE remain legacy DISPLAY constants: order
 * totals are always computed server-side by create_checkout_session
 * (live prices − validated discount, plus store_settings tax/shipping
 * since migration 00011). These constants are never added into a total
 * by client code.
 */

export type StoreVariant = {
  id: string;
  title: string;
  sku: string;
  colour: string;
  priceCents: number;
  compareAtCents: number | null;
  available: number | null;
};

export type StoreProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  priceFrom?: boolean;
  categorySlug: string | null;
  categoryName: string | null;
  variants: StoreVariant[];
  totalAvailable: number | null;
  soldOut: boolean;
  photoBg: string;
  photoLabel: string;
  dark: boolean;
};

export const SHIPPING_OPTIONS = [
  { id: "usps", name: "USPS Ground Advantage", sub: "Calculated at fulfilment · tracking by email", cents: 0, label: "At fulfilment", summaryLabel: "Shipping · USPS Ground" },
  { id: "ups", name: "UPS 2nd Day Air", sub: "Calculated at fulfilment · tracking by email", cents: 0, label: "At fulfilment", summaryLabel: "Shipping · UPS 2nd Day Air" },
  { id: "pickup", name: "Pick up at the workshop", sub: "2214 Fitzwater St · we'll email when it's ready", cents: 0, label: "Free", summaryLabel: "Pickup · workshop" },
] as const;

/** PA sales tax is NOT charged by create_checkout_session (tax_total = 0). */
export const TAX_RATE = 0;
