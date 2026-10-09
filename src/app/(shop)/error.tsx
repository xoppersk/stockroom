"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Storefront error boundary (Flagship UI Designs §2.20). */
export default function ShopError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        This page couldn&apos;t load. Try again, or head back to the shop.
      </p>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/shop">Back to shop</Link>
        </Button>
      </div>
    </div>
  );
}
