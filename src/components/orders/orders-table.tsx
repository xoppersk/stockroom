"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronRight, Download, PackageSearch, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { bulkFulfillOrders, getOrdersForExport } from "@/lib/orders/actions";
import type { OrderExportRow } from "@/lib/orders/actions";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { OrderListFilters, OrderListRow } from "@/lib/orders/filters";

import { OrderStatusPill, PaymentStatusPill } from "./status-pill";

const STATUS_CHIPS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "refunded", label: "Refunded" },
  { value: "cancelled", label: "Cancelled" },
  { value: "failed", label: "Failed" },
];

function chipHref(base: OrderListFilters, status: string): string {
  const params = new URLSearchParams();
  if (base.q) params.set("q", base.q);
  if (status) params.set("status", status);
  if (base.from) params.set("from", base.from);
  if (base.to) params.set("to", base.to);
  const query = params.toString();
  return query ? `/orders?${query}` : "/orders";
}

function toCsv(rows: OrderExportRow[]): string {
  const header = [
    "order_number",
    "created_at",
    "customer_name",
    "customer_email",
    "status",
    "payment_status",
    "source",
    "subtotal",
    "discount_total",
    "tax_total",
    "shipping_total",
    "total",
    "refunded_total",
    "tracking_number",
  ];
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = rows.map((row) =>
    [
      row.order_number,
      row.created_at,
      row.customer_name,
      row.customer_email,
      row.status,
      row.payment_status,
      row.source,
      row.subtotal,
      row.discount_total,
      row.tax_total,
      row.shipping_total,
      row.total,
      row.refunded_total,
      row.tracking_number,
    ]
      .map(escape)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

export function OrdersTable({
  orders,
  total,
  page,
  pageSize,
  filters,
  statusCounts,
  canFulfill,
  canRefund,
}: {
  orders: OrderListRow[];
  total: number;
  page: number;
  pageSize: number;
  filters: OrderListFilters;
  statusCounts: Record<string, number>;
  canFulfill: boolean;
  canRefund: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [isFulfilling, startFulfill] = useTransition();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function pageHref(nextPage: number): string {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.status) params.set("status", filters.status);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (nextPage > 1) params.set("page", String(nextPage));
    const query = params.toString();
    return query ? `/orders?${query}` : "/orders";
  }

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  function togglePage() {
    setSelected((prev) =>
      orders.every((o) => prev.includes(o.id)) ? prev.filter((id) => !orders.some((o) => o.id === id)) : [...new Set([...prev, ...orders.map((o) => o.id)])],
    );
  }

  function runBulkFulfill() {
    setBulkMessage(null);
    startFulfill(async () => {
      const result = await bulkFulfillOrders({ orderIds: selected });
      if (!result.ok) {
        setBulkMessage(result.error);
        return;
      }
      setBulkMessage(
        `Marked ${result.fulfilled} order${result.fulfilled === 1 ? "" : "s"} fulfilled` +
          (result.skipped > 0 ? ` — ${result.skipped} skipped (not paid).` : "."),
      );
      setSelected([]);
      router.refresh();
    });
  }

  async function runExport() {
    setExporting(true);
    try {
      const rows = await getOrdersForExport(filters);
      const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `stockroom-orders-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const params = new URLSearchParams();
          const q = String(data.get("q") ?? "").trim();
          const from = String(data.get("from") ?? "");
          const to = String(data.get("to") ?? "");
          if (q) params.set("q", q);
          if (filters.status) params.set("status", filters.status);
          if (from) params.set("from", from);
          if (to) params.set("to", to);
          const query = params.toString();
          router.push(query ? `/orders?${query}` : "/orders");
        }}
      >
        <div className="flex flex-col gap-2 md:flex-row md:items-end">
          <div className="flex-1">
            <Label htmlFor="order-search" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Search
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="order-search"
                name="q"
                defaultValue={filters.q ?? ""}
                placeholder="Order number, customer, or email…"
                className="pl-9"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="order-from" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              From
            </Label>
            <Input id="order-from" name="from" type="date" defaultValue={filters.from ?? ""} className="min-h-11" />
          </div>
          <div>
            <Label htmlFor="order-to" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              To
            </Label>
            <Input id="order-to" name="to" type="date" defaultValue={filters.to ?? ""} className="min-h-11" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="min-h-11">Apply</Button>
            {(filters.q ?? filters.from ?? filters.to) && (
              <Button type="button" variant="outline" className="min-h-11" onClick={() => router.push(filters.status ? `/orders?status=${filters.status}` : "/orders")}>
                <X className="size-4" /> Clear
              </Button>
            )}
          </div>
        </div>
      </form>

      {/* Status chips (deep-linkable) */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
        {STATUS_CHIPS.map((chip) => {
          const active = (filters.status ?? "") === chip.value;
          const count = chip.value === "" ? total : (statusCounts[chip.value] ?? 0);
          return (
            <Link
              key={chip.value || "all"}
              href={chipHref(filters, chip.value)}
              role="tab"
              aria-selected={active}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:border-primary/50",
              )}
            >
              {chip.label}
              <span className={cn("text-xs tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>
                {count}
              </span>
            </Link>
          );
        })}
        <div className="ml-auto">
          <Button variant="outline" onClick={runExport} disabled={exporting} className="min-h-11">
            <Download className="size-4" /> {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        </div>
      </div>

      {bulkMessage && (
        <p className="rounded-lg border bg-muted px-4 py-2.5 text-sm" role="status">
          {bulkMessage}
        </p>
      )}

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-center">
          <PackageSearch className="size-8 text-muted-foreground" />
          <h3 className="font-semibold tracking-tight">No orders match</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            Try widening the date range, clearing the search, or picking a different status.
          </p>
          <Button variant="outline" asChild className="mt-2">
            <Link href="/orders">Clear all filters</Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {canFulfill && (
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label="Select all orders on this page"
                        checked={orders.length > 0 && orders.every((o) => selected.includes(o.id))}
                        onCheckedChange={togglePage}
                      />
                    </TableHead>
                  )}
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id} className={cn("h-14", selected.includes(order.id) && "bg-muted/50")}>
                    {canFulfill && (
                      <TableCell>
                        <Checkbox
                          aria-label={`Select ${order.order_number}`}
                          checked={selected.includes(order.id)}
                          onCheckedChange={() => toggle(order.id)}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <Link
                        href={`/orders/${order.order_number}`}
                        className="font-mono text-[13px] font-medium tabular-nums hover:underline"
                      >
                        {order.order_number}
                      </Link>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {new Date(order.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-[13px]">{order.customer_name}</div>
                      {order.customer_email && (
                        <div className="text-xs text-muted-foreground">{order.customer_email}</div>
                      )}
                    </TableCell>
                    <TableCell><OrderStatusPill status={order.status} /></TableCell>
                    <TableCell><PaymentStatusPill status={order.payment_status} /></TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(order.total)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {canRefund &&
                          (order.status === "paid" ||
                            order.status === "fulfilled" ||
                            order.payment_status === "partially_refunded") && (
                            <Button variant="outline" size="sm" asChild className="min-h-11">
                              <Link href={`/orders/${order.order_number}?action=refund`}>
                                Refund
                              </Link>
                            </Button>
                          )}
                        <Button variant="ghost" size="icon" asChild aria-label={`Open ${order.order_number}`}>
                          <Link href={`/orders/${order.order_number}`}>
                            <ChevronRight className="size-4" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-2 md:hidden">
            {orders.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.order_number}`}
                className="rounded-lg border bg-card p-4 active:bg-muted/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/orders/${order.order_number}`}
                    className="font-mono text-[13px] font-medium tabular-nums hover:underline"
                  >
                    {order.order_number}
                  </Link>
                  <OrderStatusPill status={order.status} />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-muted-foreground">{order.customer_name}</span>
                  <span className="font-semibold tabular-nums">{formatMoney(order.total)}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {new Date(order.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  {" · "}
                  <PaymentStatusPill status={order.payment_status} />
                </div>
                {canRefund &&
                  (order.status === "paid" ||
                    order.status === "fulfilled" ||
                    order.payment_status === "partially_refunded") && (
                    <div className="mt-2">
                      <Button variant="outline" size="sm" asChild className="min-h-11">
                        <Link href={`/orders/${order.order_number}?action=refund`}>Refund</Link>
                      </Button>
                    </div>
                  )}
              </Link>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span className="tabular-nums">
              Page {page} of {totalPages} · {total} order{total === 1 ? "" : "s"}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild disabled={page <= 1} className="min-h-11">
                <Link href={pageHref(page - 1)} aria-disabled={page <= 1}>Previous</Link>
              </Button>
              <Button variant="outline" size="sm" asChild disabled={page >= totalPages} className="min-h-11">
                <Link href={pageHref(page + 1)} aria-disabled={page >= totalPages}>Next</Link>
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Bulk action bar */}
      {canFulfill && selected.length > 0 && (
        <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border bg-card py-2 pl-5 pr-2 shadow-lg">
          <span className="text-sm font-medium tabular-nums">
            {selected.length} selected
          </span>
          <Button size="sm" onClick={runBulkFulfill} disabled={isFulfilling} className="min-h-11 rounded-full">
            {isFulfilling ? "Fulfilling…" : "Mark fulfilled"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])} className="min-h-11 rounded-full">
            <X className="size-4" />
            <span className="sr-only">Clear selection</span>
          </Button>
        </div>
      )}

      {selected.length > 0 && (
        <Badge variant="outline" className="sr-only" aria-live="polite">
          {selected.length} orders selected
        </Badge>
      )}
    </div>
  );
}
