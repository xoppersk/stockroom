"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "./Button";
import { Stamp } from "./Stamp";

type Props = {
  kind: "paused" | "blocking";
  asOfLabel?: string;
  queuedCount?: number;
  onRetry?: () => void;
  /** X-08: append the screen's "Retrying in N s." with a live countdown. */
  retryCountdown?: boolean;
  children?: ReactNode;
};

/** §7 SystemBanner.
 *  Paused (role="status"): tape-tint strip under the AppBar — Offline stamp,
 *  a sentence naming the "as of" time, the queued count when > 0, Retry now.
 *  Blocking (role="alert"): panel fill with a 1.5px problem outline.
 *  Default paused copy is SysReconnect.html's, verbatim: "Live updates
 *  paused since 11:42 AM. You're seeing figures as of then. Stock changes
 *  are paused too, so counts can't drift. Retrying in 12 s." (SR-09 —
 *  the banner previously paraphrased it and leaked the 10:48 shop clock). */
export function SystemBanner({ kind, asOfLabel, queuedCount, onRetry, retryCountdown = false, children }: Props) {
  const [secs, setSecs] = useState(12);
  useEffect(() => {
    if (!retryCountdown) return;
    const t = setInterval(() => setSecs((s) => (s <= 1 ? 12 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [retryCountdown]);

  if (kind === "blocking") {
    return (
      <div role="alert" className="banner-blocking">
        {children}
      </div>
    );
  }
  return (
    <div role="status" className="banner-paused">
      <Stamp tone="tape">Offline</Stamp>
      <span className="banner-text">
        {children ?? (
          <>
            <b>Live updates paused{asOfLabel ? <> since <span className="mono">{asOfLabel}</span></> : null}.</b>{" "}
            You&rsquo;re seeing figures as of then. Stock changes are paused too, so
            counts can&rsquo;t drift.
            {retryCountdown ? <> Retrying in {secs} s.</> : null}
            {queuedCount != null && queuedCount > 0 ? (
              <> {queuedCount} waiting to send — they go out on reconnect.</>
            ) : null}
          </>
        )}
      </span>
      {onRetry ? <Button onClick={onRetry}>Retry now</Button> : null}
    </div>
  );
}
