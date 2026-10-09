import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Package } from "lucide-react";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

import { LoginFormWithNext } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Sign in (Flagship UI Designs §2.1): centered 400px card on warm paper with
 * the Stockroom wordmark. No sidebar, no chrome.
 */
export default function LoginPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-4">
      <Link href="/" className="flex items-center gap-2.5" aria-label="Stockroom home">
        <span className="grid size-8 place-items-center rounded-[2px] bg-primary">
          <Package className="size-[18px] text-white" strokeWidth={2.25} />
        </span>
        <span className="font-display text-[15px] font-semibold uppercase tracking-[0.06em]">
          Stockroom
        </span>
      </Link>
      <Card className="w-full max-w-[400px]">
        <CardHeader>
          <CardTitle className="font-display text-xl">Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          {/* useSearchParams() needs a Suspense boundary for static prerendering. */}
          <Suspense>
            <LoginFormWithNext />
          </Suspense>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">Contact your admin for access.</p>
        </CardFooter>
      </Card>
    </div>
  );
}
