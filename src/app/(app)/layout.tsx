import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getUser } from "@/lib/auth/get-user";
import { currentRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app/app-shell";
import type { NavBadges } from "@/components/app/app-sidebar";

export const metadata: Metadata = { title: "App" };

/**
 * Authenticated routes are per-user and per-request: navigations into (app)
 * are allowed to block on the session/profile read instead of prerendering.
 * (Next 16 validates instant navigations by default; instant = false opts the
 * whole (app) segment out of that validation.)
 */
export const instant = false;

/**
 * Authenticated app shell. The middleware already redirects signed-out
 * visitors, but the layout re-checks (defense in depth), loads the profile
 * for the header/sidebar, the staff role for nav gating, and the live badge
 * counts (unfulfilled orders, low-stock variants) for the sidebar.
 *
 * A signed-in user with no `user_roles` row yet (invite not completed) is
 * sent back to /login — an admin must grant a role in Settings first.
 */
export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) {
    redirect("/login");
  }

  const role = await currentRole();
  if (!role) {
    redirect("/login");
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  // Sidebar badges: unfulfilled orders + variants below their reorder point.
  let badges: NavBadges | null = null;
  try {
    const [{ count: unfulfilled }, { data: levels }] = await Promise.all([
      supabase.from("orders").select("id", { count: "exact", head: true }).in("status", ["pending", "paid"]),
      supabase.from("inventory_levels").select("quantity_on_hand, low_stock_threshold").limit(5000),
    ]);
    const lowStock = (levels ?? []).filter((l) => l.quantity_on_hand < l.low_stock_threshold).length;
    badges = { orders: unfulfilled ?? 0, inventory: lowStock };
  } catch {
    badges = null;
  }

  return (
    <AppShell
      email={user.email}
      displayName={profile?.full_name ?? null}
      role={role}
      badges={badges}
    >
      {children}
    </AppShell>
  );
}
