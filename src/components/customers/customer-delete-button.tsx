"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deleteCustomer } from "@/lib/customers/actions";

/** Delete-customer button with confirmation. The action guards paid orders. */
export function CustomerDeleteButton({
  customerId,
  customerName,
}: {
  customerId: string;
  customerName: string;
}) {
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (
      !window.confirm(
        `Delete ${customerName}? Their order history keeps the order rows, but the profile is gone. This can't be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("id", customerId);
      const result = await deleteCustomer({ ok: false }, fd);
      // Success redirects to /customers; only failures land here.
      if (!result.ok) window.alert(result.error ?? "Couldn't delete the customer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleDelete}
      disabled={busy}
      className="text-destructive hover:text-destructive"
    >
      <Trash2 className="size-4" /> Delete
    </Button>
  );
}
