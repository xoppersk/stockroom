/* Money + number formatting shared by console and storefront.
   All money is integer cents in fixtures; display is dollars. */

export function money(cents: number, opts?: { decimals?: boolean }): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const d = dollars.toLocaleString("en-US");
  if (opts?.decimals === false && rem === 0) return `${sign}$${d}`;
  return `${sign}$${d}.${String(rem).padStart(2, "0")}`;
}

/** $18,420 style (no cents) for ledger figures drawn without decimals. */
export function money0(cents: number): string {
  return money(cents, { decimals: false });
}

export function num(n: number): string {
  return n.toLocaleString("en-US");
}

/** Countdown label like "3 h 12 min" / "12 min". */
export function countdownLabel(totalMinutes: number): string {
  if (totalMinutes <= 0) return "Cut-off passed";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, "0")} min`;
}
