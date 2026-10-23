import { Suspense } from "react";
import { getCartView } from "@/lib/shop/cart";
import { createShopServiceClient } from "@/lib/shop/db";
import CheckoutClient from "./CheckoutClient";

/* S-05 — Checkout. The summary is the REAL cart (server read of
   carts/cart_items with live variant prices). Placing the order posts to
   /api/checkout → create_checkout_session → /order/[id]. */

export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutInner />
    </Suspense>
  );
}

async function CheckoutInner() {
  const serviceConfigured = createShopServiceClient() !== null;
  const view = await getCartView();
  return <CheckoutClient initialCart={view} serviceConfigured={serviceConfigured} />;
}
