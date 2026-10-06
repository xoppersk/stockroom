import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/require-user";
import { requireRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { PipelineCards, type PipelineStage } from "@/components/dashboard/pipeline-cards";
import { LowStockPanel, type LowStockRow } from "@/components/dashboard/low-stock-panel";
import { TopProducts, type TopProductRow } from "@/components/dashboard/top-products";
import { ActivityFeed, type ActivityRow } from "@/components/dashboard/activity-feed";
import { formatMoney, toCents } from "@/lib/money";

export const metadata: Metadata = { title: "Dashboard" };

const DAY_MS = 86_400_000;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function deltaPercent(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

/**
 * Dashboard (Phase 7): the morning check — KPIs with sparklines and deltas,
 * revenue chart, order pipeline with deep links, low-stock panel, top
 * products, and the activity feed. Everything comes from live queries.
 */
export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  await requireRole(["admin", "warehouse", "support"], "/dashboard");
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();
  const greetingName = profile?.full_name || user.email?.split("@")[0] || "there";

  // eslint-disable-next-line react-hooks/purity -- server component: evaluated once per request, so Date.now() is stable for this render.
  const now = Date.now();
  const start30 = new Date(now - 30 * DAY_MS);
  const start60 = new Date(now - 60 * DAY_MS);

  // --- Orders: last 60 days ------------------------------------------------
  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, status, total, refunded_total, created_at")
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
  const ordersCur = cur.length;
  const ordersPrev = prev.length;
  const aovCur = ordersCur > 0 ? revenueCur / ordersCur : 0;
  const aovPrev = ordersPrev > 0 ? revenuePrev / ordersPrev : 0;

  // Daily series for the last 30 days.
  const days: string[] = [];
  const dailyRevenue = new Map<string, number>();
  const dailyOrders = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const key = dayKey(new Date(now - i * DAY_MS));
    days.push(key);
    dailyRevenue.set(key, 0);
    dailyOrders.set(key, 0);
  }
  for (const o of cur) {
    const key = dayKey(new Date(o.created_at));
    if (!dailyRevenue.has(key)) continue;
    dailyRevenue.set(key, (dailyRevenue.get(key) ?? 0) + netOf(o));
    dailyOrders.set(key, (dailyOrders.get(key) ?? 0) + 1);
  }
  const revenueSeries = days.map((d) => (dailyRevenue.get(d) ?? 0) / 100);
  const ordersSeries = days.map((d) => dailyOrders.get(d) ?? 0);
  const aovSeries = days.map((_, i) => {
    const n = ordersSeries[i] ?? 0;
    return n > 0 ? (revenueSeries[i] ?? 0) / n : 0;
  });

  // --- Pipeline counts (all time) ------------------------------------------
  const { data: allStatuses } = await supabase
    .from("orders")
    .select("status")
    .limit(5000);
  const counts: Record<string, number> = {};
  for (const o of allStatuses ?? []) counts[o.status] = (counts[o.status] ?? 0) + 1;
  const stages: PipelineStage[] = [
    { status: "pending", label: "Pending", count: counts.pending ?? 0, tone: "warning" },
    { status: "paid", label: "Paid", count: counts.paid ?? 0, tone: "success" },
    { status: "fulfilled", label: "Fulfilled", count: counts.fulfilled ?? 0, tone: "info" },
    { status: "refunded", label: "Refunded", count: counts.refunded ?? 0, tone: "neutral" },
    { status: "cancelled", label: "Cancelled", count: counts.cancelled ?? 0, tone: "neutral" },
    { status: "failed", label: "Failed", count: counts.failed ?? 0, tone: "destructive" },
  ];

  // --- Low stock -------------------------------------------------------------
  const { data: levels } = await supabase
    .from("inventory_levels")
    .select("variant_id, quantity_on_hand, low_stock_threshold")
    .limit(5000);
  const lowLevels = (levels ?? []).filter((l) => l.quantity_on_hand < l.low_stock_threshold);
  const lowVariantIds = lowLevels.map((l) => l.variant_id);
  const { data: lowVariants } = lowVariantIds.length > 0
    ? await supabase.from("product_variants").select("id, sku, title, product_id").in("id", lowVariantIds)
    : { data: null };
  const lowProductIds = [...new Set((lowVariants ?? []).map((v) => v.product_id))];
  const { data: lowProducts } = lowProductIds.length > 0
    ? await supabase.from("products").select("id, title").in("id", lowProductIds)
    : { data: null };
  const lowProductTitle = new Map((lowProducts ?? []).map((p) => [p.id, p.title]));
  const lowVariantOf = new Map((lowVariants ?? []).map((v) => [v.id, v]));
  const lowStockRows: LowStockRow[] = lowLevels
    .map((l) => {
      const v = lowVariantOf.get(l.variant_id);
      if (!v) return null;
      return {
        variantId: v.id,
        sku: v.sku,
        productTitle: lowProductTitle.get(v.product_id) ?? "Unknown product",
        variantTitle: v.title,
        quantity: l.quantity_on_hand,
        threshold: l.low_stock_threshold,
      };
    })
    .filter((r): r is LowStockRow => r !== null)
    .sort((a, b) => a.threshold - a.quantity - (b.threshold - b.quantity))
    .slice(0, 8);
  const outCount = lowLevels.filter((l) => l.quantity_on_hand <= 0).length;

  // --- Top products (30d, from line items of paid/fulfilled orders) -----------
  const paidOrderIds = cur.filter((o) => paidStatuses.has(o.status)).map((o) => o.id);
  const { data: items } = paidOrderIds.length > 0
    ? await supabase
        .from("order_items")
        .select("product_title, quantity, line_total")
        .in("order_id", paidOrderIds)
        .limit(5000)
    : { data: null };
  const byProduct = new Map<string, { units: number; revenueCents: number }>();
  for (const item of items ?? []) {
    const entry = byProduct.get(item.product_title) ?? { units: 0, revenueCents: 0 };
    entry.units += item.quantity;
    entry.revenueCents += toCents(item.line_total);
    byProduct.set(item.product_title, entry);
  }
  const topProducts: TopProductRow[] = [...byProduct.entries()]
    .map(([productTitle, v]) => ({ productTitle, units: v.units, revenueCents: v.revenueCents }))
    .sort((a, b) => b.revenueCents - a.revenueCents)
    .slice(0, 5);

  // --- Recent activity ---------------------------------------------------------
  const { data: recentEvents } = await supabase
    .from("order_events")
    .select("id, order_id, event_type, message, created_by, created_at")
    .order("created_at", { ascending: false })
    .limit(12);
  const eventOrderIds = [...new Set((recentEvents ?? []).map((e) => e.order_id))];
  const { data: eventOrders } = eventOrderIds.length > 0
    ? await supabase.from("orders").select("id, order_number").in("id", eventOrderIds)
    : { data: null };
  const orderNumberOf = new Map((eventOrders ?? []).map((o) => [o.id, o.order_number]));
  const eventActorIds = [...new Set((recentEvents ?? []).map((e) => e.created_by).filter((id): id is string => id !== null))];
  const { data: eventActors } = eventActorIds.length > 0
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Good to see you, {greetingName}.</h1>
        <p className="text-muted-foreground">
          The morning check — last 30 days against the 30 before that.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Revenue · 30d"
          value={formatMoney(revenueCur / 100)}
          deltaPercent={deltaPercent(revenueCur, revenuePrev)}
          sparkValues={revenueSeries}
          sparkId="revenue"
          hint="Net of refunds"
        />
        <KpiCard
          label="Orders · 30d"
          value={String(ordersCur)}
          deltaPercent={deltaPercent(ordersCur, ordersPrev)}
          sparkValues={ordersSeries}
          sparkId="orders"
        />
        <KpiCard
          label="Avg order value"
          value={formatMoney(aovCur / 100)}
          deltaPercent={deltaPercent(aovCur, aovPrev)}
          sparkValues={aovSeries}
          sparkId="aov"
        />
        <KpiCard
          label="Low-stock variants"
          value={String(lowLevels.length)}
          deltaPercent={null}
          sparkValues={[]}
          sparkId="lowstock"
          hint={outCount > 0 ? `${outCount} completely out of stock` : "Nothing fully out of stock"}
          link="/inventory?alert=low"
          linkLabel="Review low stock"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Revenue · last 30 days</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueChart days={days} values={revenueSeries} />
          </CardContent>
        </Card>
        <LowStockPanel rows={lowStockRows} />
      </div>

      <PipelineCards stages={stages} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <TopProducts rows={topProducts} />
        <ActivityFeed rows={activity} />
      </div>
    </div>
  );
}
