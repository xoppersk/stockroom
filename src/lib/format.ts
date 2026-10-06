/**
 * Shared formatting helpers for the Stockroom admin.
 *
 * Money is stored as numeric(12,2) and arrives from Supabase as a string.
 * All formatting goes through here so every screen renders the same way:
 * tabular numerals, right-aligned in tables (see DESIGN-BRIEF.md §3).
 */

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Accepts the string-or-number shape Supabase returns for numeric columns. */
export function formatMoney(value: string | number | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (Number.isNaN(n)) return USD.format(0);
  return USD.format(n);
}

/** Compact "Jan 4, 2026" style dates for table cells. */
const SHORT_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return SHORT_DATE.format(d);
}

/** Full "Jan 4, 2026, 3:04 PM" for detail headers and timelines. */
const LONG_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return LONG_DATE.format(d);
}

/** "WEL-10" style display for a discount: 10% off / $5.00 off. */
export function formatDiscountValue(
  kind: "percentage" | "fixed",
  value: string | number,
): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (kind === "percentage") return `${trimNumber(n)}% off`;
  return `${formatMoney(n)} off`;
}

function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}
