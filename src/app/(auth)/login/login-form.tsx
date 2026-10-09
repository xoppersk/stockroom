"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, MailCheck } from "lucide-react";

import { safeNextPath } from "@/lib/auth/redirect-path";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Where magic-link emails should send the user after the callback. */
function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
}

type Status = { kind: "error" | "info"; message: string } | null;

/**
 * Sign-in form (Flagship UI Designs §2.1): Password / Magic link tabs, the
 * Stockroom wordmark card, caps-lock hint, and the exact inline copy for
 * every error and success state.
 */
export function LoginFormWithNext() {
  const searchParams = useSearchParams();
  return <LoginForm next={safeNextPath(searchParams.get("next"))} expired={searchParams.get("error") === "expired"} />;
}

export function LoginForm({ next, expired }: { next: string; expired: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [capsLock, setCapsLock] = useState(false);
  const [status, setStatus] = useState<Status>(
    expired ? { kind: "error", message: "That link expired — request a new one." } : null,
  );
  const [pending, setPending] = useState(false);
  const [magicSentTo, setMagicSentTo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  async function onPasswordSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setStatus(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      // Spec: clear the password, return focus, inline copy.
      setPassword("");
      setStatus({ kind: "error", message: "Invalid email or password." });
      setPending(false);
      passwordRef.current?.focus();
      return;
    }

    router.push(safeNextPath(next));
    router.refresh();
  }

  async function sendMagicLink(target: string) {
    setPending(true);
    setStatus(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: target,
      options: {
        emailRedirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent(safeNextPath(next))}`,
      },
    });

    setPending(false);
    if (error) {
      setStatus({
        kind: "error",
        message: "We couldn't send that link — check the address and try again.",
      });
      return;
    }
    setMagicSentTo(target);
    setResendIn(30);
  }

  async function onMagicSubmit(event: FormEvent) {
    event.preventDefault();
    await sendMagicLink(email);
  }

  return (
    <Tabs defaultValue="password" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="password">Password</TabsTrigger>
        <TabsTrigger value="magic">Magic link</TabsTrigger>
      </TabsList>

      <TabsContent value="password">
        <form onSubmit={onPasswordSubmit} className="flex flex-col gap-4 pt-2">
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
            <Label htmlFor="password">Password</Label>
            <Input
              ref={passwordRef}
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => setCapsLock(event.getModifierState?.("CapsLock") ?? false)}
              onKeyUp={(event) => setCapsLock(event.getModifierState?.("CapsLock") ?? false)}
              aria-describedby={capsLock ? "caps-hint" : undefined}
            />
            {capsLock && (
              <p id="caps-hint" className="text-xs text-warning">
                Caps lock is on.
              </p>
            )}
          </div>
          {status && (
            <p role={status.kind === "error" ? "alert" : "status"} className="text-sm text-destructive">
              {status.message}
            </p>
          )}
          <Button type="submit" disabled={pending} className="min-h-11 w-full">
            {pending && <Loader2 className="size-4 animate-spin" />}
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </TabsContent>

      <TabsContent value="magic">
        {magicSentTo ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-success-soft">
              <MailCheck className="size-6 text-success" />
            </span>
            <p className="font-display text-base font-semibold">Check your inbox</p>
            <p className="text-sm text-muted-foreground">
              We sent a sign-in link to <span className="font-medium text-foreground">{magicSentTo}</span>.
            </p>
            <Button
              variant="outline"
              disabled={pending || resendIn > 0}
              onClick={() => void sendMagicLink(magicSentTo)}
              className="mt-2 min-h-11"
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Sending link…
                </>
              ) : resendIn > 0 ? (
                `Resend link (${resendIn}s)`
              ) : (
                "Resend link"
              )}
            </Button>
          </div>
        ) : (
          <form onSubmit={onMagicSubmit} className="flex flex-col gap-4 pt-2">
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
            {status && (
              <p role={status.kind === "error" ? "alert" : "status"} className="text-sm text-destructive">
                {status.message}
              </p>
            )}
            <Button type="submit" disabled={pending} className="min-h-11 w-full">
              {pending && <Loader2 className="size-4 animate-spin" />}
              {pending ? "Sending link…" : "Email me a link"}
            </Button>
          </form>
        )}
      </TabsContent>
    </Tabs>
  );
}
