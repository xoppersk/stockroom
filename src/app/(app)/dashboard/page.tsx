import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";

import { requireUser } from "@/lib/auth/require-user";
import { currentRole, requireRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { PipelineCards, type PipelineStage } from "@/components/dashboard/pipeline-cards";
import { ActivityFeed, type ActivityRow } from "@/components/dashboard/activity-feed";
import { ExportOrdersButton } from "@/components/dashboard/export-orders-button";
import { FirstRunChecklist } from "@/components/dashboard/first-run-checklist";
import { InventoryWatch, type WatchRow } from "@/components/dashboard/inventory-watch";
import { OpsLedger, type OpsLedgerLine } from "@/components/dashboard/ops-ledger";
import { RevenuePostingChart, type PostingWeek } from "@/components/dashboard/revenue-posting-chart";
import { formatMoney, toCents } from "@/lib/money";

export const metadata: Metadata = { title: "Dashboard" };

const DAY_MS = 86_400_000;

function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function longDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function shortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function monthDay(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function signedDelta(current: number, previous: number): string {
  if (previous <= 0) return current > 0 ? "+100%" : "—";
  const pct = ((current - previous) / previous) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

/**
 * Dashboard — the Signature UI (Flagship UI Designs, stockroomProto).
 *
 * Exceptions lead the queue: held orders and low-stock SKUs render in
 * tape-amber above the revenue facts, then the four-period revenue posting
 * and the inventory watch. The order pipeline and activity feed sit below for
 * the steady-state triage flows (F1/F3). Every figure is a live query; nothing
 * here is demo data.
 */
export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  await requireRole(["admin", "warehouse", "support"], "/dashboard");
  const role = await currentRole();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();
  const firstName = profile?.full_name?.split(" ")[0] || user.email?.split("@")[0] || "there";

  const now = new Date();

  // --- Held orders: failed or still pending ---------------------------------
  const { data: held } = await supabase
    .from("orders")
    .select("id, order_number, customer_id, status, created_at, customers(first_name, last_name)")
    .in("status", ["failed", "pending"])
    .order("created_at", { ascending: true })
    .limit(50);
  const heldCount = held?.length ?? 0;
  const topHeld = held?.[0] ?? null;
  const topHeldCustomer = topHeld
    ? [topHeld.customers?.first_name, topHeld.customers?.last_name].filter(Boolean).join(" ") || null
    : null;

  // --- Low stock ---------------------------------------------------------------
  const { data: levels } = await supabase
    .from("inventory_levels")
    .select("variant_id, quantity_on_hand, low_stock_threshold")
    .limit(5000);
  const lowLevels = (levels ?? []).filter((l) => l.quantity_on_hand < l.low_stock_threshold);
  const atZero = lowLevels.filter((l) => l.quantity_on_hand <= 0).length;
  const lowVariantIds = lowLevels.map((l) => l.variant_id);
  const { data: lowVariants } =
    lowVariantIds.length > 0
      ? await supabase.from("product_variants").select("id, sku, title, product_id").in("id", lowVariantIds)
      : { data: null };
  const lowProductIds = [...new Set((lowVariants ?? []).map((v) => v.product_id))];
  const { data: lowProducts } =
    lowProductIds.length > 0
      ? await supabase.from("products").select("id, title").in("id", lowProductIds)
      : { data: null };
  const lowProductTitle = new Map((lowProducts ?? []).map((p) => [p.id, p.title]));
  const lowVariantOf = new Map((lowVariants ?? []).map((v) => [v.id, v]));
  const watchRows: WatchRow[] = lowLevels
    .map((l) => {
      const v = lowVariantOf.get(l.variant_id);
      if (!v) return null;
      return {
        productTitle: lowProductTitle.get(v.product_id) ?? "Unknown product",
        variantTitle: v.title,
        sku: v.sku,
        onHand: l.quantity_on_hand,
        reorderAt: l.low_stock_threshold,
      };
    })
    .filter((r): r is WatchRow => r !== null)
    .sort((a, b) => a.reorderAt - a.onHand - (b.reorderAt - b.onHand))
    .slice(0, 8);

  // --- Revenue + volume ----------------------------------------------------------
  const start30 = new Date(now.getTime() - 30 * DAY_MS);
  const start60 = new Date(now.getTime() - 60 * DAY_MS);
  const { data: orders } = await supabase
    .from("orders")
    .select("id, status, total, refunded_total, created_at")
    .gte("created_at", start60.toISOString())
    .order("created_at", { ascending: false })
    .limit(5000);
  const paidStatuses = new Set(["paid", "fulfilled"]);
  const netOf = (o: { status: string; total: string; refunded_total: string }) =>
    paidStatuses.has(o.status) ? toCents(o.total) - toCents(o.refunded_total) : 0;
  const in30 = (o: { created_at: string }) => new Date(o.created_at).getTime() >= start30.getTime();
  const cur = (orders ?? []).filter(in30);
  const prev = (orders ?? []).filter((o) => !in30(o));
  const revenueCur = cur.reduce((s, o) => s + netOf(o), 0);
  const revenuePrev = prev.reduce((s, o) => s + netOf(o), 0);

  const start7 = new Date(now.getTime() - 7 * DAY_MS);
  const start14 = new Date(now.getTime() - 14 * DAY_MS);
  const vol7 = cur.filter((o) => new Date(o.created_at).getTime() >= start7.getTime()).length;
  const volPrior7 = cur.filter(
    (o) => {
      const t = new Date(o.created_at).getTime();
      return t >= start14.getTime() && t < start7.getTime();
    },
  ).length;
  const volDelta = vol7 - volPrior7;

  // --- Four weekly postings (last four 7-day periods) ------------------------------
  const postings: PostingWeek[] = [];
  for (let i = 3; i >= 0; i--) {
    const end = new Date(now.getTime() - i * 7 * DAY_MS);
    const start = new Date(end.getTime() - 7 * DAY_MS);
    const revenue = (orders ?? [])
      .filter((o) => {
        const t = new Date(o.created_at).getTime();
        return t >= start.getTime() && t < end.getTime();
      })
      .reduce((s, o) => s + netOf(o), 0);
    postings.push({ label: monthDay(end), revenue: revenue / 100, isDip: false });
  }
  const dipIndex = postings.reduce((min, p, i) => (p.revenue < postings[min]!.revenue ? i : min), 0);
  postings[dipIndex]!.isDip = true;
  const postingMonth = now.toLocaleDateString("en-US", { month: "long" });

  // --- Pipeline counts (all time) ----------------------------------------------------
  const { data: allStatuses } = await supabase.from("orders").select("status").limit(5000);
  const counts: Record<string, number> = {};
  for (const o of allStatuses ?? []) counts[o.status] = (counts[o.status] ?? 0) + 1;
  const stages: PipelineStage[] = [
    { status: "paid", label: "Paid", count: counts.paid ?? 0, tone: "success" },
    { status: "fulfilled", label: "Fulfilled", count: counts.fulfilled ?? 0, tone: "info" },
    { status: "refunded", label: "Refunded", count: counts.refunded ?? 0, tone: "neutral" },
    { status: "cancelled", label: "Cancelled", count: counts.cancelled ?? 0, tone: "neutral" },
  ];

  // --- Recent activity -------------------------------------------------------------------
  const { data: recentEvents } = await supabase
    .from("order_events")
    .select("id, order_id, event_type, message, created_by, created_at")
    .order("created_at", { ascending: false })
    .limit(12);
  const eventOrderIds = [...new Set((recentEvents ?? []).map((e) => e.order_id))];
  const { data: eventOrders } =
    eventOrderIds.length > 0
      ? await supabase.from("orders").select("id, order_number").in("id", eventOrderIds)
      : { data: null };
  const orderNumberOf = new Map((eventOrders ?? []).map((o) => [o.id, o.order_number]));
  const eventActorIds = [
    ...new Set((recentEvents ?? []).map((e) => e.created_by).filter((id): id is string => id !== null)),
  ];
  const { data: eventActors } =
    eventActorIds.length > 0
      ? await supabase.from("profiles").select("id, full_name").in("id", eventActorIds)
      : { data: null };
  const eventActorName = new Map((eventActors ?? []).map((a) => [a.id, a.full_name]));
  const activity: ActivityRow[] = (recentEvents ?? []).map((e) => ({
    id: e.id,
    orderId: e.order_id,
    orderNumber: orderNumberOf.get(e.order_id) ?? "—",
    eventType: e.event_type,
    message: e.message,
    actorName: e.created_by ? (eventActorName.get(e.created_by) ?? null) : null,
    createdAt: e.created_at,
  }));

  // --- First-run checklist (admin, empty store) ----------------------------------------------
  const { count: orderTotal } = await supabase.from("orders").select("id", { count: "exact", head: true });
  const { count: productTotal } = await supabase.from("products").select("id", { count: "exact", head: true });
  const firstRun = (orderTotal ?? 0) === 0 && (productTotal ?? 0) === 0 && role === "admin";

  const ledgerLines: OpsLedgerLine[] = [
    {
      label: "Held orders",
      value: String(heldCount),
      note: topHeld
        ? `${topHeld.order_number} · ${topHeldCustomer ?? "Unknown customer"} · next action: ${
            topHeld.status === "failed" ? "review the failure" : "confirm payment"
          }`
        : "Nothing held — the queue is clear.",
      href: held?.some((o) => o.status === "failed") ? "/orders?status=failed" : "/orders?status=pending",
      exception: heldCount > 0,
    },
    {
      label: "Low-stock SKUs",
      value: String(lowLevels.length),
      note:
        lowLevels.length > 0
          ? `${lowLevels.length - atZero} below safety stock · ${atZero} at zero`
          : "Every variant is above its reorder point.",
      href: "/inventory?alert=low",
      exception: lowLevels.length > 0,
    },
    {
      label: "Net revenue",
      value: formatMoney(revenueCur / 100),
      note: `${signedDelta(revenueCur, revenuePrev)} versus prior period`,
      href: "/orders",
    },
    {
      label: "Order volume",
      value: String(cur.length),
      note:
        volDelta === 0
          ? "Even with last week."
          : `${Math.abs(volDelta)} ${volDelta > 0 ? "more" : "fewer"} than last week.`,
      href: "/orders",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Topline */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-[24px] font-semibold tracking-[-0.05em]">
            {greetingFor(now)}, {firstName}
          </h1>
          <p className="mt-1 text-[12px] text-muted-foreground">{longDate(now)} · Store operations</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportOrdersButton />
          <Button asChild>
            <Link href="/orders/new">
              <Plus className="size-4" />
              New order
            </Link>
          </Button>
        </div>
      </div>

      {firstRun && <FirstRunChecklist />}

      <OpsLedger periodLabel={shortDate(now)} cutoffLabel="Fulfillment cut-off 2:00 PM" lines={ledgerLines} />

      <RevenuePostingChart weeks={postings} monthLabel={postingMonth} year={now.getFullYear()} />

      <InventoryWatch countedLabel={shortDate(now)} rows={watchRows} />

      <PipelineCards stages={stages} />

      <ActivityFeed rows={activity} />
    </div>
  );
}
