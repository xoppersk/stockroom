/**
 * Money helpers. Postgres `numeric(12,2)` arrives from PostgREST as a string,
 * so every helper accepts `string | number`. All arithmetic goes through
 * integer cents to avoid floating-point drift.
 */

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** "$1,234.56" — never throws, falls back to $0.00 on bad input. */
export function formatMoney(value: string | number | null | undefined): string {
  const n = Number(value);
  return usd.format(Number.isFinite(n) ? n : 0);
}

/** Dollars → integer cents. */
export function toCents(value: string | number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Integer cents → "12.34" string suitable for numeric columns. */
export function fromCents(cents: number): string {
  return (Math.round(cents) / 100).toFixed(2);
}

/** Compact "$1.2k" for dense dashboard labels. */
export function formatCompactMoney(value: string | number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}
