"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";

const STEPS = [
  { label: "Add your first product", href: "/products/new" },
  { label: "Set your tax rate", href: "/settings" },
  { label: "Invite your team", href: "/settings" },
];

/** First-run checklist banner (Flagship UI Designs §2.3) — admin only, dismissible. */
export function FirstRunChecklist() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
      <ClipboardCheck className="mt-0.5 size-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-sm font-semibold">Get the store running</p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {STEPS.map((step) => (
            <li key={step.label}>
              <Button variant="link" size="sm" asChild className="h-auto p-0 text-sm">
                <Link href={step.href}>{step.label}</Link>
              </Button>
            </li>
          ))}
        </ul>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss setup checklist"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
