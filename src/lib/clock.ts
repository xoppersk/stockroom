/* Shop clock (HANDOVER §10): the demo "now" starts at Tue Oct 6, 2026
   10:48 AM ET (cut-off 2:00 PM → the drawn "3 h 12 min") and advances in
   real time from module load, so countdowns stay honest during a session. */
import { SHOP_TIMEZONE } from "./config";

const BASE_UTC_MS = Date.UTC(2026, 9, 6, 14, 48, 0); // 10:48 AM EDT
let loadedAt: number | null = null; // lazy: no clock read at module scope
const CUTOFF_MINUTES = 14 * 60; // 2:00 PM

export function shopNow(): Date {
  if (loadedAt === null) loadedAt = Date.now();
  return new Date(BASE_UTC_MS + (Date.now() - loadedAt));
}

/** The fixture base instant (Tue Oct 6 2026, 10:48 AM EDT) with NO clock
 *  read — safe during prerender (Cache Components forbids Date.now()).
 *  Render paths use this as their initial value; effects tick forward. */
export function shopBaseDate(): Date {
  return new Date(BASE_UTC_MS);
}

const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: SHOP_TIMEZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** "10:48 AM" style label in the shop's time zone. */
export function formatShopTime(d: Date): string {
  return timeFmt.format(d);
}

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: SHOP_TIMEZONE,
  hour: "numeric",
  minute: "numeric",
  hour12: false,
});

/** Whole minutes from shop-now until the 2:00 PM cut-off (negative after). */
export function minutesToCutoff(now: Date = shopNow()): number {
  let hour = 0;
  let minute = 0;
  for (const part of partsFmt.formatToParts(now)) {
    if (part.type === "hour") hour = Number(part.value) % 24;
    if (part.type === "minute") minute = Number(part.value);
  }
  return CUTOFF_MINUTES - (hour * 60 + minute);
}
