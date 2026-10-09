import Link from "next/link";
import { PackageOpen } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * 404 (Flagship UI Designs §2.20): paper background, box illustration,
 * "This shelf is empty".
 */
export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-muted">
        <PackageOpen className="size-8 text-muted-foreground" aria-hidden />
      </span>
      <h1 className="font-display text-2xl font-semibold tracking-tight">This shelf is empty</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The page you&apos;re looking for isn&apos;t here — it may have moved or never existed.
      </p>
      <div className="mt-2 flex gap-2">
        <Button asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Back to store</Link>
        </Button>
      </div>
    </div>
  );
}
