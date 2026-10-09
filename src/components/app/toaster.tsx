"use client";

import { lazy, Suspense } from "react";

/**
 * Sonner Toaster, loaded lazily so the toast library stays out of every
 * route's initial client JS (bundle gate). Toasts: bottom-right desktop,
 * top-center mobile (System §2.20).
 */
const SonnerToaster = lazy(() => import("sonner").then((m) => ({ default: m.Toaster })));

export function ClientToaster() {
  return (
    <Suspense fallback={null}>
      <SonnerToaster position="bottom-right" toastOptions={{ duration: 4000 }} />
    </Suspense>
  );
}
