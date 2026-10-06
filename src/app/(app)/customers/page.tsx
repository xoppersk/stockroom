import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Search, Users } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireRole } from "@/lib/auth/roles";
import { formatDate, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Customers" };

const PAGE_SIZE = 25;

/** Orders that count toward "total spent". Pending/failed/cancelled never do. */
const SPENT_STATUSES = ["paid", "fulfilled", "refunded"] as const;

interface CustomerListParams {
  q?: string;
  tag?: string;
  page?: string;
}

function fullName(c: { first_name: string; last_name: string }): string {
  return `${c.first_name} ${c.last_name}`.trim();
}

/**
 * Customers list (Phase 6): search by name/email, tag filter, pagination.
 * Columns: name, email, orders count, total spent, tags. Admin + support only.
 */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<CustomerListParams>;
}) {
  await requireRole(["admin", "support"], "/customers");

  const params = await searchParams;
  // Commas would break the .or() filter syntax below; strip them.
  const q = (params.q ?? "").trim().replace(/,/g, "");
  const tag = (params.tag ?? "").trim();
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const supabase = await createClient();

  let query = supabase
    .from("customers")
    .select("id, first_name, last_name, email, phone, tags, created_at", {
      count: "exact",
    });

  if (q) {
    const like = `%${q}%`;
    query = query.or(
      `first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`,
    );
  }
  if (tag) {
    query = query.contains("tags", [tag]);
  }

  const from = (page - 1) * PAGE_SIZE;
  const { data: customers, count } = await query
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  const rows = customers ?? [];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  // Per-customer order aggregates for the current page.
  const ids = rows.map((c) => c.id);
  const { data: orders } = ids.length
    ? await supabase
        .from("orders")
        .select("customer_id, status, total")
        .in("customer_id", ids)
    : { data: [] };

  const stats = new Map<string, { orders: number; spent: number }>();
  for (const order of orders ?? []) {
    if (!order.customer_id) continue;
    const entry = stats.get(order.customer_id) ?? { orders: 0, spent: 0 };
    if (order.status !== "cancelled") entry.orders += 1;
    if ((SPENT_STATUSES as readonly string[]).includes(order.status)) {
      entry.spent += Number(order.total);
    }
    stats.set(order.customer_id, entry);
  }

  // Tag options for the filter (all tags in the directory).
  const { data: tagRows } = await supabase.from("customers").select("tags");
  const allTags = [...new Set((tagRows ?? []).flatMap((r) => r.tags))].sort(
    (a, b) => a.localeCompare(b),
  );

  const pageParams = (next: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (tag) p.set("tag", tag);
    p.set("page", String(next));
    return `/customers?${p.toString()}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="text-muted-foreground">
            {count ?? 0} {(count ?? 0) === 1 ? "customer" : "customers"} in the
            directory.
          </p>
        </div>
        <Button asChild>
          <Link href="/customers/new">
            <Plus className="size-4" /> New customer
          </Link>
        </Button>
      </div>

      <form
        method="get"
        action="/customers"
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search name or email…"
            className="pl-9"
            aria-label="Search customers"
          />
        </div>
        <select
          name="tag"
          defaultValue={tag}
          aria-label="Filter by tag"
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-48"
        >
          <option value="">All tags</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {q || tag ? (
          <Button type="button" variant="ghost" asChild>
            <Link href="/customers">Clear</Link>
          </Button>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q || tag ? "No customers match" : "No customers yet"}
          description={
            q || tag
              ? "Try a different search or clear the filters."
              : "Add your first customer to start building the directory."
          }
          action={
            !q && !tag ? (
              <Button asChild>
                <Link href="/customers/new">
                  <Plus className="size-4" /> New customer
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Total spent</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead>Since</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((customer) => {
                    const s = stats.get(customer.id) ?? { orders: 0, spent: 0 };
                    return (
                      <TableRow key={customer.id} className="h-14">
                        <TableCell className="font-medium">
                          <Link
                            href={`/customers/${customer.id}`}
                            className="hover:underline"
                          >
                            {fullName(customer)}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {customer.email ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s.orders}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatMoney(s.spent)}
                        </TableCell>
                        <TableCell>
                          <div className="flex max-w-56 flex-wrap gap-1">
                            {customer.tags.length === 0 ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              customer.tags.slice(0, 3).map((t) => (
                                <Badge key={t} variant="secondary">
                                  {t}
                                </Badge>
                              ))
                            )}
                            {customer.tags.length > 3 ? (
                              <Badge variant="outline">
                                +{customer.tags.length - 3}
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(customer.created_at)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Mobile cards */}
          <div className="grid gap-3 md:hidden">
            {rows.map((customer) => {
              const s = stats.get(customer.id) ?? { orders: 0, spent: 0 };
              return (
                <Link key={customer.id} href={`/customers/${customer.id}`}>
                  <Card className="transition-colors hover:border-primary/50">
                    <CardContent className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{fullName(customer)}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {customer.email ?? "No email"}
                        </p>
                        {customer.tags.length > 0 ? (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {customer.tags.slice(0, 2).map((t) => (
                              <Badge key={t} variant="secondary">
                                {t}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold tabular-nums">
                          {formatMoney(s.spent)}
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {s.orders} {s.orders === 1 ? "order" : "orders"}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>

          {totalPages > 1 ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground tabular-nums">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  asChild={page > 1}
                  disabled={page <= 1}
                >
                  {page > 1 ? (
                    <Link href={pageParams(page - 1)}>
                      <ChevronLeft className="size-4" /> Prev
                    </Link>
                  ) : (
                    <span className="inline-flex items-center">
                      <ChevronLeft className="size-4" /> Prev
                    </span>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  asChild={page < totalPages}
                  disabled={page >= totalPages}
                >
                  {page < totalPages ? (
                    <Link href={pageParams(page + 1)}>
                      Next <ChevronRight className="size-4" />
                    </Link>
                  ) : (
                    <span className="inline-flex items-center">
                      Next <ChevronRight className="size-4" />
                    </span>
                  )}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
