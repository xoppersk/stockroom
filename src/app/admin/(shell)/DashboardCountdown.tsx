"use client";

/* Dashboard cut-off countdown island (W-ORDERS rewire).
   The value is REAL now vs the 2:00 PM cut-off (ruling 8 — the fixture
   shop clock is gone): computed in the shop timezone, re-synced every
   30 s. The server passes its own computed value as the initial prop
   so first paint matches the server render; the island ticks from
   there. Format is Main.html's local "3h 12m" form. */
import { useEffect, useState } from "react";
import { SHOP_TIMEZONE } from "@/lib/config";

const CUTOFF_MINUTES = 14 * 60; // 2:00 PM — src/lib/config.ts CUTOFF_LABEL

export function minutesToCutoffNow(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SHOP_TIMEZONE,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  let hour = 0;
  let minute = 0;
  for (const part of parts) {
    if (part.type === "hour") hour = Number(part.value) % 24;
    if (part.type === "minute") minute = Number(part.value);
  }
  return Math.max(0, CUTOFF_MINUTES - (hour * 60 + minute));
}

function fmtCountdown(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export function DashboardCountdown({ initialMinutes }: { initialMinutes: number }) {
  const [mins, setMins] = useState(initialMinutes);
  useEffect(() => {
    // Re-sync with the real clock on mount, then every 30 s.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMins(minutesToCutoffNow());
    const t = setInterval(() => setMins(minutesToCutoffNow()), 30_000);
    return () => clearInterval(t);
  }, []);
  return <div className="cc-cutoff-value">{fmtCountdown(mins)}</div>;
}
