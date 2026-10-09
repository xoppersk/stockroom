"use client";

import { Button } from "@/components/ui/button";

/**
 * Route-segment error boundary (Flagship UI Designs §2.20): never a blank
 * page — "Something went wrong" + "Try again" resets the segment.
 */
export default function SegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50svh] flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        {error.message || "This section couldn't load. Your data is safe — try again."}
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
