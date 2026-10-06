"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

import { safeNextPath } from "@/lib/auth/redirect-path";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

/** Where magic-link / OAuth emails should send the user after the callback. */
function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
}

type Status = { kind: "error" | "info"; message: string } | null;

/**
 * Reads ?next= on the client. Must be rendered inside a <Suspense> boundary
 * (see login/page.tsx) so the /login page shell can stay prerendered.
 */
export function LoginFormWithNext() {
  const searchParams = useSearchParams();
  return <LoginForm next={safeNextPath(searchParams.get("next"))} />;
}

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [pending, setPending] = useState(false);

  async function onPasswordSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setStatus(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setStatus({ kind: "error", message: error.message });
      setPending(false);
      return;
    }

    router.push(safeNextPath(next));
    router.refresh();
  }

  async function onMagicSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setStatus(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent(safeNextPath(next))}`,
      },
    });

    setPending(false);
    setStatus(
      error
        ? { kind: "error", message: error.message }
        : { kind: "info", message: "Check your inbox — we sent you a sign-in link." },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {mode === "password" ? (
        <form onSubmit={onPasswordSubmit} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link href="/forgot-password" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Sign in
          </Button>
        </form>
      ) : (
        <form onSubmit={onMagicSubmit} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="magic-email">Email</Label>
            <Input
              id="magic-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Email me a sign-in link
          </Button>
          <p className="text-sm text-muted-foreground">
            No password needed — we&apos;ll email you a one-time link.
          </p>
        </form>
      )}

      {status ? (
        <p
          role={status.kind === "error" ? "alert" : "status"}
          className={
            status.kind === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"
          }
        >
          {status.message}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">or</span>
        <Separator className="flex-1" />
      </div>

      <Button
        variant="outline"
        className="w-full"
        onClick={() => {
          setMode(mode === "password" ? "magic" : "password");
          setStatus(null);
        }}
      >
        {mode === "password" ? "Continue with magic link" : "Continue with password"}
      </Button>
    </div>
  );
}
