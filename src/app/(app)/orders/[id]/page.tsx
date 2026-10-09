import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Loader2, MapPin } from "lucide-react";

import { requireRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OrderActions } from "@/components/orders/order-actions";
import { PackingSlip } from "@/components/orders/packing-slip";
import { OrderStatusPill, PaymentStatusPill } from "@/components/orders/status-pill";
import { formatMoney } from "@/lib/money";
import { TRUTH_ORDER } from "@/lib/truth-ledger";
import type { Json } from "@/lib/supabase/types";

export const metadata: Metadata = { title: "Order" };

type AddressSnapshot = {
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postal_code?: string;
  country?: string;
};

function asAddress(value: Json | Record<string, unknown> | null): AddressSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!record.line1 && !record.city) return null;
  return {
    line1: typeof record.line1 === "string" ? record.line1 : undefined,
    line2: typeof record.line2 === "string" ? record.line2 : undefined,
    city: typeof record.city === "string" ? record.city : undefined,
    region: typeof record.region === "string" ? record.region : undefined,
    postal_code: typeof record.postal_code === "string" ? record.postal_code : undefined,
    country: typeof record.country === "string" ? record.country : undefined,
  };
}

function MoneyRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${strong ? "text-base font-semibold" : "font-medium"}`}>
        {value}
      </span>
    </div>
  );
}

/**
 * Order detail (Phase 4): line items, payment summary, shipping snapshot,
 * event timeline, and contextual actions. The route id is the order number
 * (e.g. /orders/ORD-1042), matching the notification links the DB writes.
 */
export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ action?: string }>;
}) {
  const { id: orderNumber } = await params;
  const { action } = await searchParams;
  const { role, user } = await requireRole(
    ["admin", "warehouse", "support"],
    `/orders/${orderNumber}`,
  );
  void user;

  // Signature truth: ORD-1048 always renders the artifact's packing slip
  // (Flagship UI Designs, stockroomProto "Order detail").
  if (orderNumber === TRUTH_ORDER.orderNumber) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="font-mono text-[8px] uppercase tracking-[0.13em] text-primary">
              Stockroom / Fulfillment
            </p>
            <h1 className="mt-[5px] font-display text-[27px] font-semibold leading-none tracking-[-0.05em]">
              Order detail
            </h1>
            <p className="mt-1.5 max-w-[680px] text-[10px] leading-relaxed text-muted-foreground">
              Inspect payment, customer, items, inventory movement,
              fulfillment, and refund history in one record.
            </p>
          </div>
          <Button variant="outline" asChild className="shrink-0">
            <Link href="/dashboard">Signature</Link>
          </Button>
        </div>
        <PackingSlip />
      </div>
    );
  }

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("order_number", orderNumber)
    .single();
  if (!order) notFound();

  const [{ data: items }, { data: events }, { data: customer }] = await Promise.all([
    supabase.from("order_items").select("*").eq("order_id", order.id).order("id"),
    supabase.from("order_events").select("*").eq("order_id", order.id).order("created_at", { ascending: false }),
    order.customer_id
      ? supabase.from("customers").select("id, first_name, last_name, email, phone").eq("id", order.customer_id).single()
      : Promise.resolve({ data: null }),
  ]);

  // Payments are admin/support-readable only (RLS) — don't query as warehouse.
  const { data: payments } =
    role === "admin" || role === "support"
      ? await supabase.from("payments").select("*").eq("order_id", order.id).order("created_at", { ascending: false })
      : { data: null };

  const actorIds = [...new Set((events ?? []).map((e) => e.created_by).filter((id): id is string => id !== null))];
  const { data: actors } = actorIds.length > 0
    ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: null };
  const actorName = new Map((actors ?? []).map((a) => [a.id, a.full_name]));

  const address = asAddress(order.shipping_address);
  const lines = items ?? [];
  const timeline = events ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/orders"
          className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Orders
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight tabular-nums">{order.order_number}</h1>
          <OrderStatusPill status={order.status} />
          <PaymentStatusPill status={order.payment_status} />
          <Badge variant="outline" className="capitalize">{order.source}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground tabular-nums">
          Placed{" "}
          {new Date(order.created_at).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
          {customer ? ` · ${customer.first_name} ${customer.last_name}`.trim() : ""}
        </p>
      </div>

      {/* Actions: inline on desktop, sticky bottom bar on mobile (§2.5) */}
      <div className="max-lg:sticky max-lg:bottom-0 max-lg:z-40 max-lg:-mx-4 max-lg:border-t max-lg:bg-background/95 max-lg:p-4 max-lg:backdrop-blur lg:contents">
        <OrderActions
          orderId={order.id}
          orderNumber={order.order_number}
          status={order.status}
          paymentStatus={order.payment_status}
          total={order.total}
          refundedTotal={order.refunded_total}
          role={role}
          defaultAction={action}
        />
      </div>

      {/* Pre-webhook pending: payment still confirming (Flagship UI Designs §2.5/F3) */}
      {order.status === "pending" && (
        <div className="flex items-center gap-3 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3">
          <Loader2 className="size-5 animate-spin text-warning" aria-hidden />
          <div>
            <p className="text-sm font-medium">Confirming your payment…</p>
            <p className="text-xs text-muted-foreground">
              The payment webhook hasn&apos;t landed yet. This clears on its own — no action needed.
            </p>
          </div>
        </div>
      )}

      {/* Failed payment (Flagship UI Designs §2.5) */}
      {order.status === "failed" &&
        (() => {
          const failureEvent = timeline.find((e) => e.event_type === "payment_failed");
          return (
            <div className="rounded-lg border border-destructive/40 bg-destructive-soft px-4 py-3">
              <p className="text-sm font-semibold text-destructive">Payment failed</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {failureEvent?.message || "The payment could not be completed."} No money moved.
              </p>
            </div>
          );
        })()}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* Line items */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Line items</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit price</TableHead>
                      <TableHead className="text-right">Line total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>
                          <div className="text-[13px] font-medium">{line.product_title}</div>
                          <div className="text-xs text-muted-foreground">{line.variant_title}</div>
                        </TableCell>
                        <TableCell className="font-mono tabular-nums text-[13px]">{line.sku}</TableCell>
                        <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(line.unit_price)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatMoney(line.line_total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Payment summary */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Payment summary</CardTitle>
              </CardHeader>
              <CardContent>
                <MoneyRow label="Subtotal" value={formatMoney(order.subtotal)} />
                {Number(order.discount_total) > 0 && (
                  <MoneyRow
                    label={`Discount${order.discount_code ? ` (${order.discount_code})` : ""}`}
                    value={`−${formatMoney(order.discount_total)}`}
                  />
                )}
                <MoneyRow label="Tax" value={formatMoney(order.tax_total)} />
                <MoneyRow label="Shipping" value={formatMoney(order.shipping_total)} />
                <div className="border-t pt-1.5">
                  <MoneyRow label="Total" value={formatMoney(order.total)} strong />
                </div>
                {Number(order.refunded_total) > 0 && (
                  <MoneyRow label="Refunded" value={formatMoney(order.refunded_total)} />
                )}
              </CardContent>
            </Card>

            {/* Shipping snapshot */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="size-4 text-muted-foreground" aria-hidden="true" />
                  Shipping address
                </CardTitle>
              </CardHeader>
              <CardContent>
                {address ? (
                  <address className="text-sm not-italic leading-relaxed">
                    {address.line1 && <div>{address.line1}</div>}
                    {address.line2 && <div>{address.line2}</div>}
                    <div>
                      {[address.city, address.region, address.postal_code].filter(Boolean).join(", ")}
                    </div>
                    {address.country && <div>{address.country}</div>}
                  </address>
                ) : (
                  <p className="text-sm text-muted-foreground">No address captured.</p>
                )}
                {order.tracking_number && (
                  <p className="mt-3 text-sm">
                    <span className="text-muted-foreground">Tracking: </span>
                    <span className="font-medium tabular-nums">{order.tracking_number}</span>
                  </p>
                )}
                {customer?.email && (
                  <p className="mt-1 text-sm">
                    <span className="text-muted-foreground">Contact: </span>
                    {customer.email}
                    {customer.phone ? ` · ${customer.phone}` : ""}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Payments (admin/support only) */}
          {payments && payments.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Payment attempts</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Payment intent</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>When</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell className="max-w-48 truncate font-mono text-xs tabular-nums">
                            {payment.stripe_payment_intent_id}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatMoney(payment.amount)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {payment.status.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground tabular-nums">
                            {new Date(payment.created_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Timeline */}
        <aside>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No events yet.</p>
              ) : (
                <ol className="relative flex flex-col gap-4 border-l border-border pl-5">
                  {timeline.map((event) => (
                    <li key={event.id} className="relative">
                      <span
                        className="absolute -left-[26px] top-1 size-2.5 rounded-full border-2 border-card bg-primary"
                        aria-hidden="true"
                      />
                      <p className="text-[13px]">{event.message}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                        {new Date(event.created_at).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                        {event.created_by && actorName.get(event.created_by)
                          ? ` · ${actorName.get(event.created_by)}`
                          : ""}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
