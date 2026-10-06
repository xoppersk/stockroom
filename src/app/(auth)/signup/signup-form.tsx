"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
}

type Status = { kind: "error" | "info"; message: string } | null;

export function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [pending, setPending] = useState(false);

  async function onPasswordSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setStatus(null);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent("/app")}`,
      },
    });

    if (error) {
      setStatus({ kind: "error", message: error.message });
      setPending(false);
      return;
    }

    // No session + a user means email confirmation is on — the user must click
    // the link before they can sign in.
    if (data.user && !data.session) {
      setPending(false);
      setStatus({
        kind: "info",
        message: "Check your inbox — click the confirmation link to finish creating your account.",
      });
      return;
    }

    router.push("/dashboard");
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
        emailRedirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent("/app")}`,
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
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="8+ characters"
          />
        </div>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Create account
        </Button>
      </form>

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

      <form onSubmit={onMagicSubmit} className="flex flex-col gap-2">
        <Button type="submit" variant="outline" disabled={pending || email.trim() === ""} className="w-full">
          Sign up with a magic link
        </Button>
        <p className="text-xs text-muted-foreground">
          Uses the email above — no password needed.
        </p>
      </form>

      <p className="text-xs text-muted-foreground">
        By creating an account you agree to the project&apos;s terms.{" "}
        <Link href="/login" className="underline-offset-4 hover:underline">
          Already have an account?
        </Link>
      </p>
    </div>
  );
}
