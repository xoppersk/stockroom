"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { AppBar } from "@/components/sr/AppBar";
import { SystemBanner } from "@/components/sr/SystemBanner";
import { useShop, useShopState } from "@/lib/store";

function currentFromPath(path: string): string {
  if (path === "/admin") return "dashboard";
  if (path.startsWith("/admin/orders")) return "orders";
  if (path.startsWith("/admin/products")) return "products";
  if (path.startsWith("/admin/inventory")) return "inventory";
  if (path.startsWith("/admin/customers")) return "customers";
  if (path.startsWith("/admin/discounts")) return "discounts";
  if (path.startsWith("/admin/settings")) return "settings";
  return "dashboard";
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const { setOnline, enterOfflineDemo } = useShop();
  const { connection } = useShopState();

  /* X-08: ?state=offline drops the mock event stream into the DRAWN
     offline state (data as of 11:42 AM, the screen's queue seeded). */
  useEffect(() => {
    if (params.get("state") === "offline") enterOfflineDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  /* X-02/X-05: the empty-state screens draw an AppBar with no count
     chips (SR-14). */
  const hideCounts = params.get("state") === "empty";

  return (
    <div className="console" data-theme-area="console">
      <AppBar current={currentFromPath(pathname)} hideCounts={hideCounts} />
      {!connection.online && (
        <SystemBanner
          kind="paused"
          asOfLabel={connection.asOfLabel}
          queuedCount={connection.queue.length}
          retryCountdown={params.get("state") === "offline"}
          onRetry={() => setOnline(true)}
        />
      )}
      <main>{children}</main>
    </div>
  );
}

export default function ConsoleShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <ShellInner>{children}</ShellInner>
    </Suspense>
  );
}
