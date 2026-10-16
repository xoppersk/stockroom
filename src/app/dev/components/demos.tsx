"use client";

import { useState } from "react";
import { SystemBanner } from "@/components/sr/SystemBanner";

/** Client demo: the paused banner's Retry now needs a real handler, which a
 *  server page cannot pass down. */
export function PausedBannerDemo() {
  const [tries, setTries] = useState(0);
  return (
    <div>
      <SystemBanner kind="paused" asOfLabel="11:42 AM" queuedCount={2} onRetry={() => setTries((n) => n + 1)} />
      <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--muted)" }}>
        Retry pressed {tries} time{tries === 1 ? "" : "s"} (demo counter).
      </p>
    </div>
  );
}
