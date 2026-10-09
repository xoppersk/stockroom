import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Unauthorized (Flagship UI Designs §2.20 / F8): role-gated areas land here
 * instead of silently bouncing — "You don't have access to this area" +
 * contact-admin note. The attempt is logged server-side by requireRole's
 * callers via the audit log where it matters.
 */
export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-warning-soft">
        <ShieldAlert className="size-8 text-warning" aria-hidden />
      </span>
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        You don&apos;t have access to this area
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Your role doesn&apos;t include this section. If you need it for your work, ask an admin to
        update your access.
      </p>
      <Button asChild className="mt-2">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
