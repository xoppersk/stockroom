"use client";

import { useEffect, useState } from "react";
import { minutesToCutoff, shopBaseDate, shopNow } from "@/lib/clock";
import { countdownLabel } from "@/lib/format";

/** Cut-off countdown (§10): "{n} h {mm} min to cut-off", re-read from the
 *  shop clock every 30 s (the label itself only changes by the minute). */
export function Countdown({ className }: { className?: string }) {
  const [mins, setMins] = useState<number>(() => minutesToCutoff(shopBaseDate()));
  useEffect(() => {
    setMins(minutesToCutoff(shopNow()));
    const t = setInterval(() => setMins(minutesToCutoff(shopNow())), 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className={className}>
      {mins <= 0 ? "Cut-off passed" : `${countdownLabel(mins)} to cut-off`}
    </span>
  );
}
