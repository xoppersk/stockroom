/* Canonical storefront catalogue — derived from the approved screens and
   HANDOVER §9. Used as the display source; live stock numbers are overlaid
   from the shop store (skus) when W-DATA's store is present, so the text on
   the page always tracks the ledger. Money is integer cents. */

export type StoreVariant = {
  sku: string;
  colour: string;
  hex: string;
  dark: boolean; // caption chip style on photos
  priceCents: number;
  available: number; // fallback if the store has no live sku
  incomingLabel?: string; // "24 more arrive Friday."
  backorder?: boolean; // product-level toggle lives on the product; per-variant override
};

export type StoreProduct = {
  slug: string;
  name: string;
  priceCents: number; // from-price when priceFrom
  priceFrom?: boolean;
  colours: { name: string; hex: string }[];
  stockNote: { kind: "low" | "in" | "soldout" | "made" | "back" ; text: string; sku?: string; colour?: string };
  photoBg: string;
  photoLabel: string;
  dark: boolean;
  collection: string;
  description?: string;
};

export const COLLECTIONS: Record<string, { title: string; lede: string; count: number }> = {
  "kitchen-textiles": {
    title: "Kitchen textiles",
    lede: "Stonewashed linen in three colours, sewn in South Philadelphia. It softens with every wash.",
    count: 11,
  },
  tableware: {
    title: "Tableware",
    lede: "Mugs, boards and colanders from makers we've visited.",
    count: 14,
  },
  home: {
    title: "Home",
    lede: "Throws, candles and totes for the rest of the house.",
    count: 13,
  },
};

/* S-02 kitchen textiles — the 9 drawn cards + the 2 behind "Show 2 more". */
export const KITCHEN_TEXTILES: StoreProduct[] = [
  { slug: "linen-apron", name: "Linen apron", priceCents: 6400, colours: [{ name: "Charcoal", hex: "#3A3530" }, { name: "Natural", hex: "#D9D0C1" }, { name: "Rust", hex: "#9A4E2E" }], stockNote: { kind: "low", text: "Charcoal: 3 left", sku: "LA-CHR", colour: "Charcoal" }, photoBg: "#3A3530", photoLabel: "Photo placeholder: charcoal linen apron", dark: true, collection: "kitchen-textiles" },
  { slug: "linen-napkins", name: "Linen napkins, set of 4", priceCents: 3600, colours: [{ name: "Natural", hex: "#D9D0C1" }, { name: "Charcoal", hex: "#3A3530" }], stockNote: { kind: "in", text: "In stock" }, photoBg: "#D9D0C1", photoLabel: "Photo placeholder: natural linen napkins", dark: false, collection: "kitchen-textiles" },
  { slug: "linen-bread-bag", name: "Linen bread bag", priceCents: 2400, colours: [{ name: "Natural", hex: "#D9D0C1" }], stockNote: { kind: "in", text: "In stock" }, photoBg: "#E2DBCF", photoLabel: "Photo placeholder: linen bread bag", dark: false, collection: "kitchen-textiles" },
  { slug: "linen-table-runner", name: "Linen table runner", priceCents: 4800, colours: [{ name: "Rust", hex: "#9A4E2E" }, { name: "Natural", hex: "#D9D0C1" }], stockNote: { kind: "in", text: "In stock" }, photoBg: "#9A4E2E", photoLabel: "Photo placeholder: rust table runner", dark: true, collection: "kitchen-textiles" },
  { slug: "quilted-oven-mitts", name: "Quilted oven mitts, pair", priceCents: 3200, colours: [{ name: "Charcoal", hex: "#3A3530" }], stockNote: { kind: "in", text: "In stock" }, photoBg: "#57534E", photoLabel: "Photo placeholder: oven mitts", dark: true, collection: "kitchen-textiles" },
  { slug: "linen-tablecloth", name: "Linen tablecloth", priceCents: 9600, priceFrom: true, colours: [{ name: "Natural", hex: "#D9D0C1" }, { name: "Charcoal", hex: "#3A3530" }], stockNote: { kind: "made", text: "Made to order · ships in 5 days" }, photoBg: "#EDEAE4", photoLabel: "Photo placeholder: natural linen tablecloth", dark: false, collection: "kitchen-textiles" },
  { slug: "waffle-hand-towel", name: "Waffle hand towel", priceCents: 1800, colours: [{ name: "Natural", hex: "#D9D0C1" }], stockNote: { kind: "in", text: "In stock" }, photoBg: "#CFC6B6", photoLabel: "Photo placeholder: waffle hand towel", dark: false, collection: "kitchen-textiles" },
  { slug: "half-apron", name: "Half apron", priceCents: 5200, colours: [{ name: "Charcoal", hex: "#3A3530" }], stockNote: { kind: "soldout", text: "Sold out" }, photoBg: "#F2F1EE", photoLabel: "Photo placeholder: half apron", dark: false, collection: "kitchen-textiles" },
  { slug: "dish-cloths", name: "Dish cloths, set of 3", priceCents: 2200, colours: [{ name: "Natural", hex: "#D9D0C1" }], stockNote: { kind: "in", text: "In stock" }, photoBg: "#B8AE9C", photoLabel: "Photo placeholder: dish cloths", dark: false, collection: "kitchen-textiles" },
  { slug: "linen-tea-towel", name: "Linen tea towel", priceCents: 2200, colours: [{ name: "Natural", hex: "#D9D0C1" }, { name: "Charcoal", hex: "#3A3530" }], stockNote: { kind: "in", text: "In stock" }, photoBg: "#D9D0C1", photoLabel: "Photo placeholder: linen tea towel", dark: false, collection: "kitchen-textiles" },
  { slug: "linen-pot-holder", name: "Linen pot holder", priceCents: 1600, colours: [{ name: "Rust", hex: "#9A4E2E" }], stockNote: { kind: "in", text: "In stock" }, photoBg: "#9A4E2E", photoLabel: "Photo placeholder: linen pot holder", dark: true, collection: "kitchen-textiles" },
];

export const ALL_PRODUCTS: StoreProduct[] = [
  ...KITCHEN_TEXTILES,
  { slug: "stoneware-mug", name: "Stoneware mug", priceCents: 2800, colours: [{ name: "White", hex: "#ECE9E3" }, { name: "Terracotta", hex: "#9A4E2E" }, { name: "Moss", hex: "#6B7F6A" }], stockNote: { kind: "back", text: "Terracotta back Thursday", sku: "SM-TER", colour: "Terracotta" }, photoBg: "#ECE9E3", photoLabel: "Photo placeholder: white stoneware mug", dark: false, collection: "tableware" },
  { slug: "canvas-market-tote", name: "Canvas market tote", priceCents: 4600, colours: [{ name: "Natural", hex: "#C9B79A" }], stockNote: { kind: "in", text: "In stock" }, photoBg: "#C9B79A", photoLabel: "Photo placeholder: canvas market tote", dark: false, collection: "home" },
  { slug: "beeswax-candles", name: "Beeswax candles", priceCents: 1400, priceFrom: true, colours: [{ name: "Natural", hex: "#E8D5A8" }], stockNote: { kind: "in", text: "In stock" }, photoBg: "#E8D5A8", photoLabel: "Photo placeholder: beeswax pillar candles", dark: false, collection: "home" },
  { slug: "oak-serving-board", name: "Oak serving board", priceCents: 3800, priceFrom: true, colours: [{ name: "Oak", hex: "#A57B4F" }], stockNote: { kind: "in", text: "In stock" }, photoBg: "#A57B4F", photoLabel: "Photo placeholder: oak board", dark: true, collection: "tableware" },
];

export function productBySlug(slug: string): StoreProduct | undefined {
  return ALL_PRODUCTS.find((p) => p.slug === slug);
}

/* S-03 linen apron variants (§9 + products.json: LA-CHR 4 on shelf − 1
   committed = 3 available, 24 arrive Fri Oct 9 on PO-0215; LA-RST 11 − 2
   = 9 available — Rust is IN STOCK; the editor's back-order toggle for
   the apron is OFF). The `available` figures here are only a fallback:
   the live count always comes from the shop store's SKUs (§10). */
export const APRON_VARIANTS: StoreVariant[] = [
  { sku: "LA-CHR", colour: "Charcoal", hex: "#3A3530", dark: true, priceCents: 6400, available: 3, incomingLabel: "24 more arrive Friday." },
  { sku: "LA-NAT", colour: "Natural", hex: "#D9D0C1", dark: false, priceCents: 6400, available: 14 },
  { sku: "LA-RST", colour: "Rust", hex: "#9A4E2E", dark: true, priceCents: 6400, available: 9, incomingLabel: "12 more arrive Friday." },
];
export const APRON_BACKORDER = false;

/* Stoneware mug variants (products.json: SM-WHT 23 − 1 = 22 available;
   SM-TER 2 − 2 = 0 — sold out, 48 arrive Thu Oct 8 on PO-0214, waitlist
   11 per X-03; SM-MOS 11 available. Back-orders off for the mug too). */
export type MugVariant = StoreVariant & { waitlist?: number };
export const MUG_VARIANTS: MugVariant[] = [
  { sku: "SM-WHT", colour: "White", hex: "#ECE9E3", dark: false, priceCents: 2800, available: 22 },
  { sku: "SM-TER", colour: "Terracotta", hex: "#9A4E2E", dark: true, priceCents: 2800, available: 0, incomingLabel: "48 arrive Thursday.", waitlist: 11 },
  { sku: "SM-MOS", colour: "Moss", hex: "#6B7F6A", dark: true, priceCents: 2800, available: 11 },
];
export const MUG_BACKORDER = false;

export const NAPKIN_VARIANTS: StoreVariant[] = [
  { sku: "NP-4N", colour: "Natural", hex: "#D9D0C1", dark: false, priceCents: 3600, available: 14 },
  { sku: "NP-4C", colour: "Charcoal", hex: "#3A3530", dark: true, priceCents: 3600, available: 9 },
];

/* S-04 drawn cart seed (coordinator preference: the store's initial cart). */
export const DEMO_CART = [
  { sku: "LA-CHR", slug: "linen-apron", name: "Linen apron", variant: "Charcoal", qty: 1, priceCents: 6400, photoBg: "#3A3530", photoLabel: "Photo placeholder: charcoal apron", dark: true },
  { sku: "NP-4N", slug: "linen-napkins", name: "Linen napkins, set of 4", variant: "Natural", qty: 1, priceCents: 3600, photoBg: "#D9D0C1", photoLabel: "Photo placeholder: natural napkins", dark: false },
];

/* Display facts for cart lines, keyed by SKU (the store's cart holds
   only { sku, qty }). Seed lines keep their curated S-04 values; other
   SKUs derive from the variant tables above. */
export type CartDisplay = {
  slug: string; name: string; variant: string;
  priceCents: number; photoBg: string; photoLabel: string; dark: boolean;
};
export const CART_DISPLAY: Record<string, CartDisplay> = Object.fromEntries([
  ...DEMO_CART.map((d) => [d.sku, {
    slug: d.slug, name: d.name, variant: d.variant,
    priceCents: d.priceCents, photoBg: d.photoBg, photoLabel: d.photoLabel, dark: d.dark,
  }] as const),
  ...APRON_VARIANTS.map((v) => [v.sku, {
    slug: "linen-apron", name: "Linen apron", variant: v.colour,
    priceCents: v.priceCents, photoBg: v.hex, photoLabel: `Photo placeholder: ${v.colour.toLowerCase()} apron`, dark: v.dark,
  }] as const),
  ...NAPKIN_VARIANTS.map((v) => [v.sku, {
    slug: "linen-napkins", name: "Linen napkins, set of 4", variant: v.colour,
    priceCents: v.priceCents, photoBg: v.hex, photoLabel: `Photo placeholder: ${v.colour.toLowerCase()} napkins`, dark: v.dark,
  }] as const),
  ...MUG_VARIANTS.map((v) => [v.sku, {
    slug: "stoneware-mug", name: "Stoneware mug", variant: v.colour,
    priceCents: v.priceCents, photoBg: v.hex, photoLabel: `Photo placeholder: ${v.colour.toLowerCase()} stoneware mug`, dark: v.dark,
  }] as const),
  ["CT-NAT", {
    slug: "canvas-market-tote", name: "Canvas market tote", variant: "Natural",
    priceCents: 4600, photoBg: "#C9B79A", photoLabel: "Photo placeholder: canvas market tote", dark: false,
  }] as const,
]);

export const SHIPPING_OPTIONS = [
  { id: "usps", name: "USPS Ground Advantage", sub: "Ships today · arrives Fri, Oct 9 – Mon, Oct 12", cents: 980, label: "$9.80", summaryLabel: "Shipping · USPS Ground" },
  { id: "ups", name: "UPS 2nd Day Air", sub: "Ships today · arrives Thu, Oct 8", cents: 1840, label: "$18.40", summaryLabel: "Shipping · UPS 2nd Day Air" },
  { id: "pickup", name: "Pick up at the workshop", sub: "2214 Fitzwater St · ready by 12:45 PM today", cents: 0, label: "Free", summaryLabel: "Pickup · workshop" },
] as const;

export const TAX_RATE = 0.06; // PA 6% (§9)
