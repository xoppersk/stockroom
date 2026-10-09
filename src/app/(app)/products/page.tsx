import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getCartDetails } from "@/lib/cart/cart";
import { CartClient } from "./cart-client";

export const metadata: Metadata = { title: "Your cart" };

/** Cart page: line items with qty steppers, discount code, order summary. */
export default async function CartPage() {
  const details = await getCartDetails();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 pb-28 sm:px-6 lg:pb-10">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Your cart</h1>

      {details.lines.length === 0 ? (
        <div className="mt-8 rounded-[var(--radius)] border border-border bg-card p-12 text-center">
          <ShoppingBag className="mx-auto size-10 text-muted-foreground" aria-hidden />
          <p className="mt-4 font-medium">Your cart is empty</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse the collection and find something you love.
          </p>
          <Button asChild className="mt-6">
            <Link href="/shop">Shop products</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-8">
          <CartClient initial={details} />
        </div>
      )}
    </div>
  );
}
