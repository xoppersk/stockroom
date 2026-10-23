/* Storefront shell (§6): always light, white ground (grey --ground on the
   transactional screens as drawn), 1280px wrap (1180px cart/checkout).
   Shop pages (home / collection / product) get the full announcement bar +
   wordmark header from StoreShell; cart / checkout / confirmation /
   declined render their own slim headers + slim footers, and each page
   picks its footer variant. */
import { Suspense } from "react";
import "../../styles/store.css";
import StoreShell from "./StoreShell";
import { AccountNav } from "./_components/account-nav";

export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div className="store">{children}</div>}>
      <StoreShell
        accountNav={
          <Suspense fallback={null}>
            <AccountNav />
          </Suspense>
        }
      >
        {children}
      </StoreShell>
    </Suspense>
  );
}
