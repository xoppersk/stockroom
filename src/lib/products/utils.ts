/**
 * Small pure helpers for the product catalog. Importable from server and
 * client components alike — no Node-only or secret access here.
 */

/** "Juniper Throw Pillow" → "juniper-throw-pillow". */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 200);
}

/** Format a money value (Postgres numeric arrives as string). Always $ + 2dp. */
export function formatMoney(value: string | number | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (!Number.isFinite(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

/** Format a min–max price range, collapsing to one price when equal. */
export function formatPriceRange(prices: (string | number)[]): string {
  const nums = prices.map((p) => Number(p)).filter((n) => Number.isFinite(n));
  if (nums.length === 0) return formatMoney(0);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return min === max ? formatMoney(min) : `${formatMoney(min)} – ${formatMoney(max)}`;
}

export type StockStatus = "in" | "low" | "out";

/** Classify a variant's stock position against its threshold. */
export function getStockStatus(quantity: number, threshold: number): StockStatus {
  if (quantity <= 0) return "out";
  if (quantity <= threshold) return "low";
  return "in";
}

/**
 * Resolve a `product_images.storage_path` to a renderable URL.
 *
 * v1 media stores full https:// URLs directly; rows created from real bucket
 * uploads store the bucket-relative path, which resolves against the public
 * `product-images` bucket.
 */
export function resolveImageUrl(storagePath: string): string {
  if (/^https?:\/\//i.test(storagePath)) return storagePath;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return "";
  const path = storagePath.replace(/^\/+/, "");
  return `${base}/storage/v1/object/public/product-images/${path}`;
}

/**
 * Suggest a SKU from a prefix + option values:
 * suggestSku("JTP", { Size: "M", Color: "Terracotta" }) → "JTP-M-TER"
 */
export function suggestSku(prefix: string, optionValues: Record<string, string>): string {
  const clean = (s: string) =>
    s
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 4) || "X";
  const parts = Object.values(optionValues).map(clean);
  return [prefix.toUpperCase().replace(/[^A-Z0-9-]/g, ""), ...parts].filter(Boolean).join("-");
}

/**
 * Canonical key for a variant's option combination. Shared by the matrix
 * builder and server components so stock lookups line up with rows.
 */
export function optionKey(optionValues: Record<string, string>): string {
  return Object.keys(optionValues)
    .sort()
    .map((k) => `${k}=${optionValues[k]}`)
    .join("¦");
}

/** Cartesian product of option definitions → one combination per variant. */
export function cartesianOptions(
  options: { name: string; values: string[] }[],
): { key: string; optionValues: Record<string, string>; title: string }[] {
  const usable = options.filter((o) => o.name.trim() !== "" && o.values.length > 0);
  if (usable.length === 0) return [];

  let combos: { optionValues: Record<string, string> }[] = [{ optionValues: {} }];
  for (const option of usable) {
    const next: typeof combos = [];
    for (const combo of combos) {
      for (const value of option.values) {
        next.push({ optionValues: { ...combo.optionValues, [option.name]: value } });
      }
    }
    combos = next;
  }
  return combos.map((c) => ({
    key: optionKey(c.optionValues),
    optionValues: c.optionValues,
    title: usable.map((o) => c.optionValues[o.name]).join(" / "),
  }));
}
