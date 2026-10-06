/**
 * Pure storefront helpers — no server imports, safe for Client Components.
 */

/** Postgres `numeric` arrives as a string — format it as USD. */
export function formatUSD(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isFinite(n) ? n : 0);
}

/** Tiny inline SVG shimmer for next/image blur placeholders. */
export function shimmerPlaceholder(w = 800, h = 1000): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><rect width='100%' height='100%' fill='#f5f4f2'/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
