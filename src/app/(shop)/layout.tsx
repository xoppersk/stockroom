import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";

import { getCartCount } from "@/lib/cart/cart";

export const metadata: Metadata = {
  title: {
    default: "Juniper Supply Co. — Home & Lifestyle Goods",
    template: "%s · Juniper Supply Co.",
  },
  description:
    "Juniper Supply Co. — thoughtfully made home and lifestyle goods. A demo storefront powered by Stockroom.",
};

/**
 * Public storefront shell. Deliberately separate from the `(app)` admin
 * shell: no sidebar, no auth requirement, no staff chrome. The middleware
 * leaves every `(shop)` path public; this layout never redirects to /login.
 *
 * The header reads the cart cookie on every request (cart badge count), so
 * the whole (shop) segment opts out of instant prerender validation
 * (Next 16 validates instant navigations by default).
 */
export const instant = false;

export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const count = await getCartCount();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight"
            aria-label="Juniper Supply Co. home"
          >
            Juniper<span className="text-primary"> Supply Co.</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link
              href="/shop"
              className="rounded-md px-3 py-2 font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Shop all
            </Link>
            <Link
              href="/cart"
              className="relative ml-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-3 py-2 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}
            >
              <ShoppingBag className="size-5" aria-hidden />
              {count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground tabular-nums">
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3 sm:px-6">
          <div>
            <p className="font-semibold tracking-tight">
              Juniper<span className="text-primary"> Supply Co.</span>
            </p>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              Thoughtfully made home &amp; lifestyle goods, stocked and shipped
              with care.
            </p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
              Shop
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/shop" className="text-muted-foreground hover:text-foreground">
                  All products
                </Link>
              </li>
              <li>
                <Link href="/cart" className="text-muted-foreground hover:text-foreground">
                  Your cart
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
              About this store
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              A demo storefront for the Stockroom portfolio project. No real
              charges are made in demo mode.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
