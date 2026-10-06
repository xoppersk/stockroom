"use client";

import { useState } from "react";
import { Pause, Play, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  deleteDiscount,
  pauseDiscount,
  resumeDiscount,
} from "@/lib/discounts/actions";

/**
 * Pause / resume / delete controls for a discount row. Admin only — the
 * discounts page renders this solely for admins; the actions re-check.
 */
export function DiscountRowActions({
  id,
  code,
  paused,
  canDelete,
}: {
  id: string;
  code: string;
  paused: boolean;
  canDelete: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function run(fn: (id: string) => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    try {
      const result = await fn(id);
      if (!result.ok) window.alert(result.error ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `Delete discount code "${code}"? This can't be undone. Codes with redemptions can't be deleted.`,
      )
    ) {
      return;
    }
    await run(deleteDiscount);
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {paused ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => run(resumeDiscount)}
          title={`Resume ${code}`}
        >
          <Play className="size-4" />
          <span className="sr-only sm:not-sr-only sm:ml-1">Resume</span>
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => run(pauseDiscount)}
          title={`Pause ${code} — stops redemption immediately`}
        >
          <Pause className="size-4" />
          <span className="sr-only sm:not-sr-only sm:ml-1">Pause</span>
        </Button>
      )}
      {canDelete ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={handleDelete}
          title={`Delete ${code}`}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="size-4" />
          <span className="sr-only">Delete</span>
        </Button>
      ) : null}
    </div>
  );
}
