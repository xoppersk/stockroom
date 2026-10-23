/* Customer account shell: the storefront's slim transactional chrome
   (wordmark header + slim footer, as drawn for cart/checkout) around the
   account pages. Imports the store stylesheet directly — /account lives
   outside the (store) route group. */
import Link from "next/link";
import { Suspense } from "react";
import "../../styles/store.css";
import { StoreFooter, StoreSlimHeader } from "../(store)/_components/chrome";

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="store store-grey">
      <StoreSlimHeader
        right={
          <Link href="/" className="nl">
            Keep shopping
          </Link>
        }
      />
      <main className="swrap n" style={{ flex: 1, width: "100%" }}>
        {/* Account pages read runtime auth data (session, searchParams) —
            behind Suspense per Cache Components. */}
        <Suspense fallback={null}>{children}</Suspense>
      </main>
      <StoreFooter variant="slim" />
    </div>
  );
}
