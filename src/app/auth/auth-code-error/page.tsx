import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Sign-in link expired" };

/**
 * Landed on when /auth/callback can't exchange the auth code — the link
 * expired, was already used, or the URL was mangled.
 */
export default function AuthCodeErrorPage() {
  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>That link didn&apos;t work</CardTitle>
          <CardDescription>
            The sign-in link is invalid or has expired. Links are single-use and expire after a
            short time.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button asChild>
            <Link href="/login">Request a new link</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">Back home</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
