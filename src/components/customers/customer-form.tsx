"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCustomer, updateCustomer } from "@/lib/customers/actions";
import type { ActionState } from "@/lib/server-action";
import { cn } from "@/lib/utils";

export interface CustomerInitial {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
}

/**
 * Create / edit customer form. Works with useActionState against the
 * customers server actions; shows per-field Zod errors inline.
 */
export function CustomerForm({
  initial,
  submitLabel = "Create customer",
  className,
  onSaved,
}: {
  initial?: CustomerInitial;
  submitLabel?: string;
  className?: string;
  /** Called when an update succeeds (create redirects instead). */
  onSaved?: () => void;
}) {
  const action = initial ? updateCustomer : createCustomer;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result.ok) onSaved?.();
      return result;
    },
    { ok: false },
  );

  const fieldError = (name: string) => state.fieldErrors?.[name]?.[0];

  return (
    <form action={formAction} className={cn("space-y-5", className)} noValidate>
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="first_name">First name</Label>
          <Input
            id="first_name"
            name="first_name"
            defaultValue={initial?.first_name ?? ""}
            placeholder="Amara"
            autoComplete="given-name"
            aria-invalid={Boolean(fieldError("first_name"))}
          />
          {fieldError("first_name") ? (
            <p className="text-sm text-destructive">{fieldError("first_name")}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="last_name">Last name</Label>
          <Input
            id="last_name"
            name="last_name"
            defaultValue={initial?.last_name ?? ""}
            placeholder="Kamara"
            autoComplete="family-name"
            aria-invalid={Boolean(fieldError("last_name"))}
          />
          {fieldError("last_name") ? (
            <p className="text-sm text-destructive">{fieldError("last_name")}</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={initial?.email ?? ""}
            placeholder="amara@example.com"
            autoComplete="email"
            aria-invalid={Boolean(fieldError("email"))}
          />
          {fieldError("email") ? (
            <p className="text-sm text-destructive">{fieldError("email")}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={initial?.phone ?? ""}
            placeholder="+1 215 555 0100"
            autoComplete="tel"
            aria-invalid={Boolean(fieldError("phone"))}
          />
          {fieldError("phone") ? (
            <p className="text-sm text-destructive">{fieldError("phone")}</p>
          ) : null}
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
