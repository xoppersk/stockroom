import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DiscountForm } from "@/components/discounts/discount-form";
import { requireRole } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "New discount" };

/**
 * Discount builder (admin only). Support staff are redirected — they issue
 * one-time apology codes from the customer screen instead.
 */
export default async function NewDiscountPage() {
  await requireRole("admin", "/discounts/new");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link href="/discounts">
            <ArrowLeft className="size-4" /> Discounts
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-semibold tracking-tight">New discount</h1>
        <p className="text-muted-foreground">
          Build a campaign code. The preview shows the discount math and the
          status the code will carry.
        </p>
      </div>

      <DiscountForm />
    </div>
  );
}
