"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppBar } from "@/components/sr/AppBar";
import { SystemBanner } from "@/components/sr/SystemBanner";
import { SHOP_TIMEZONE } from "@/lib/config";
import type { getConsoleActor } from "@/lib/shop/admin";

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

/** "11:42 AM"-style label for when the connection dropped, in shop time. */
function nowLabel(): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: SHOP_TIMEZONE,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date());
  } catch {
    return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
}

export type ConsoleCounts = { heldOrders: number; lowStockSkus: number };
export type ConsoleActor = Awaited<ReturnType<typeof getConsoleActor>> | null;

function ShellInner({
  children,
  actor,
  counts,
}: {
  children: React.ReactNode;
  actor: ConsoleActor;
  counts: ConsoleCounts;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  /* Offline banner — REAL browser connection state only (W-ORDERS
     rewire, coordinator ruling): navigator.onLine + online/offline
     events. The fixture offline queue, enterOfflineDemo and the
     ?state=offline demo seeding are REMOVED (demo theatre): the queue
     is always empty, so the banner keeps its component + copy for a
     genuine offline event and shows no queued count. */
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [asOfLabel, setAsOfLabel] = useState<string>("");

  useEffect(() => {
    function goOffline() {
      setAsOfLabel(nowLabel());
      setOnline(false);
    }
    function goOnline() {
      setOnline(true);
    }
    // Sync with the browser's current state on mount, then listen.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOnline(navigator.onLine);
    if (!navigator.onLine) setAsOfLabel(nowLabel());
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  /* X-02/X-05: the empty-state screens draw an AppBar with no count
     chips (SR-14). View state only — no fixture data involved. */
  const hideCounts = params.get("state") === "empty";

  return (
    <div className="console" data-theme-area="console">
      <AppBar
        current={currentFromPath(pathname)}
        hideCounts={hideCounts}
        heldCount={counts.heldOrders}
        lowStockCount={counts.lowStockSkus}
        actorName={actor?.name}
        actorInitials={actor?.initials}
      />
      {!online && (
        <SystemBanner
          kind="paused"
          asOfLabel={asOfLabel || undefined}
          queuedCount={0}
          onRetry={() => setOnline(navigator.onLine)}
        />
      )}
      <main>{children}</main>
    </div>
  );
}

export default function ConsoleShell({
  children,
  actor,
  counts,
}: {
  children: React.ReactNode;
  actor: ConsoleActor;
  counts: ConsoleCounts;
}) {
  return (
    <Suspense fallback={null}>
      <ShellInner actor={actor} counts={counts}>
        {children}
      </ShellInner>
    </Suspense>
  );
}
