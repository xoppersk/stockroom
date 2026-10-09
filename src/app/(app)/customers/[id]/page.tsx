import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone, ShoppingBag, Tag, TicketPercent, Wallet } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
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
import { AddressManager } from "@/components/customers/address-manager";
import { ApologyCodeDialog } from "@/components/customers/apology-code-dialog";
import { CustomerDeleteButton } from "@/components/customers/customer-delete-button";
import { CustomerEditDialog } from "@/components/customers/customer-edit-dialog";
import { NotesTimeline } from "@/components/customers/notes-timeline";
import { TagsEditor } from "@/components/customers/tags-editor";
import { requireRole } from "@/lib/auth/roles";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Customer" };

const SPENT_STATUSES = ["paid", "fulfilled", "refunded"] as const;

const ORDER_STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-600/15 text-amber-700 dark:text-amber-400",
  paid: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400",
  fulfilled: "bg-blue-600/15 text-blue-700 dark:text-blue-400",
  refunded: "bg-stone-500/15 text-stone-500",
  cancelled: "bg-stone-500/15 text-stone-500",
  failed: "bg-red-600/15 text-red-700 dark:text-red-400",
};

/**
 * Customer detail (Phase 6): profile header, lifetime stats, tags, addresses,
 * order history, notes timeline, and discount usage. Admin + support only.
 */
export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["admin", "support"], "/customers");
  const { id } = await params;

  const supabase = await createClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!customer) notFound();

  const [{ data: addresses }, { data: orders }, { data: redemptions }] =
    await Promise.all([
      supabase
        .from("customer_addresses")
        .select("*")
        .eq("customer_id", id)
        .order("is_default", { ascending: false }),
      supabase
        .from("orders")
        .select("id, order_number, status, total, created_at")
        .eq("customer_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("discount_redemptions")
        .select("id, discount_id, order_id, amount, created_at")
        .eq("customer_id", id)
        .order("created_at", { ascending: false }),
    ]);

  const orderList = orders ?? [];
  const spent = orderList
    .filter((o) => (SPENT_STATUSES as readonly string[]).includes(o.status))
    .reduce((sum, o) => sum + Number(o.total), 0);
  const fullName = `${customer.first_name} ${customer.last_name}`.trim();

  // Resolve redemption code + order number for display.
  const discountIds = [...new Set((redemptions ?? []).map((r) => r.discount_id))];
  const orderIds = [...new Set((redemptions ?? []).map((r) => r.order_id))];
  const [{ data: discountRows }, { data: redemptionOrders }] = await Promise.all([
    discountIds.length
      ? supabase.from("discounts").select("id, code").in("id", discountIds)
      : Promise.resolve({ data: [] }),
    orderIds.length
      ? supabase.from("orders").select("id, order_number").in("id", orderIds)
      : Promise.resolve({ data: [] }),
  ]);
  const codeById = new Map((discountRows ?? []).map((d) => [d.id, d.code]));
  const orderNoById = new Map(
    (redemptionOrders ?? []).map((o) => [o.id, o.order_number]),
  );

  const initials = fullName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" asChild className="w-fit -ml-2">
        <Link href="/customers">
          <ArrowLeft className="size-4" /> Customers
        </Link>
      </Button>

      {/* Profile header */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/15 text-lg font-semibold text-primary">
            {initials || "?"}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-2xl font-semibold tracking-tight">
              {fullName}
            </h1>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {customer.email ? (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-3.5" /> {customer.email}
                </span>
              ) : null}
              {customer.phone ? (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-3.5" /> {customer.phone}
                </span>
              ) : null}
              <span>Customer since {formatDate(customer.created_at)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ApologyCodeDialog customerId={customer.id} customerName={fullName} />
            <CustomerEditDialog
              customer={{
                id: customer.id,
                first_name: customer.first_name,
                last_name: customer.last_name,
                email: customer.email,
                phone: customer.phone,
              }}
            />
            <CustomerDeleteButton customerId={customer.id} customerName={fullName} />
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <Wallet className="size-3.5" /> Lifetime value
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">
              {formatMoney(spent)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <ShoppingBag className="size-3.5" /> Orders
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">
              {orderList.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <TicketPercent className="size-3.5" /> Codes used
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">
              {(redemptions ?? []).length}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Order history */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Order history</CardTitle>
            </CardHeader>
            <CardContent className={cn(orderList.length > 0 && "p-0")}>
              {orderList.length === 0 ? (
                <EmptyState
                  icon={ShoppingBag}
                  title="No orders yet"
                  description="Orders placed for this customer will appear here."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="hidden sm:table-cell">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderList.map((order) => (
                      <TableRow key={order.id} className="h-14">
                        <TableCell className="font-medium">
                          <Link
                            href={`/orders/${order.id}`}
                            className="font-mono text-[13px] hover:underline"
                          >
                            {order.order_number}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={cn(
                              ORDER_STATUS_STYLES[order.status] ?? "",
                              "capitalize",
                            )}
                          >
                            {order.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatMoney(order.total)}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">
                          {formatDate(order.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Notes timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <NotesTimeline customerId={customer.id} rawNotes={customer.notes} />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          {/* Tags */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Tag className="size-4" /> Tags
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TagsEditor customerId={customer.id} initialTags={customer.tags} />
            </CardContent>
          </Card>

          {/* Addresses */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Addresses</CardTitle>
            </CardHeader>
            <CardContent>
              <AddressManager customerId={customer.id} addresses={addresses ?? []} />
            </CardContent>
          </Card>

          {/* Discount usage */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Discount usage</CardTitle>
            </CardHeader>
            <CardContent>
              {(redemptions ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No discount codes redeemed yet. Codes issued to this customer
                  are recorded in the notes timeline.
                </p>
              ) : (
                <ul className="space-y-3">
                  {(redemptions ?? []).map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <div>
                        <p className="font-mono font-medium">
                          {codeById.get(r.discount_id) ?? "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {orderNoById.get(r.order_id) ? (
                            <Link
                              href={`/orders/${r.order_id}`}
                              className="hover:underline"
                            >
                              {orderNoById.get(r.order_id)}
                            </Link>
                          ) : (
                            "Order removed"
                          )}{" "}
                          · {formatDateTime(r.created_at)}
                        </p>
                      </div>
                      <span className="font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                        −{formatMoney(r.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
