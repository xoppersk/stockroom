import { Suspense } from "react";
import CheckoutClient from "./CheckoutClient";

/* S-05 / X-07 — ?state=declined is read in the client island in <Suspense>. */
export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutClient />
    </Suspense>
  );
}
