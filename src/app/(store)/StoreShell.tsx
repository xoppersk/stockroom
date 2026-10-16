"use client";
/* Client shell for the storefront: picks the chrome variant by route.
   Lives behind a <Suspense> boundary in layout.tsx because usePathname()
   is runtime data under Cache Components. */
import { usePathname } from "next/navigation";
import { StoreHeader } from "./_components/chrome";

const SHOP_ROUTES = (p: string | null) =>
  p === "/" || !!p?.startsWith("/collections") || !!p?.startsWith("/products");

export default function StoreShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const shop = SHOP_ROUTES(pathname);
  return (
    <div className={`store${shop ? "" : " store-grey"}`}>
      {shop && <StoreHeader />}
      {children}
    </div>
  );
}
