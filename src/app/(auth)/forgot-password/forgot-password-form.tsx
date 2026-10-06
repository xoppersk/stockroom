"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{ kind: "error" | "info"; message: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setStatus(null);

    const supabase = createClient();
    // The reset link hits /auth/callback first (code exchange), which then
    // forwards to /reset-password with a live session.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
    });

    setPending(false);
    setStatus(
      error
        ? { kind: "error", message: error.message }
        : {
            kind: "info",
            message: "If an account exists for that email, a reset link is on its way.",
          },
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Send reset link
      </Button>
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
    </form>
  );
}
