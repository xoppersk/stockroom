import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { requireRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { OrdersTable } from "@/components/orders/orders-table";
import { fetchOrdersPage } from "@/lib/orders/filters";
import { OrderFiltersSchema } from "@/lib/orders/schemas";

export const metadata: Metadata = { title: "Orders" };

const PAGE_SIZE = 25;

type SearchParams = {
  q?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: string;
};

/**
 * Orders list (Phase 4): search, deep-linkable status chips, date range,
 * bulk fulfill, CSV export. Warehouse sees fulfill controls; support sees
 * refund entry points on the detail pages.
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { role } = await requireRole(["admin", "warehouse", "support"], "/orders");
  const raw = await searchParams;
  const parsed = OrderFiltersSchema.safeParse(raw);
  const filters = parsed.success
    ? parsed.data
    : { q: undefined, status: undefined, from: undefined, to: undefined, page: 1 };

  const supabase = await createClient();
  const { rows, total, statusCounts } = await fetchOrdersPage(supabase, filters, filters.page, PAGE_SIZE);

  const canFulfill = role === "admin" || role === "warehouse";
  const canCreate = role === "admin" || role === "support";
  const canRefund = role === "admin" || role === "support";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">
            Filter, fulfill, refund, and track every order.
          </p>
        </div>
        {canCreate && (
          <Button asChild className="min-h-11 shrink-0">
            <Link href="/orders/new">
              <Plus className="size-4" /> New order
            </Link>
          </Button>
        )}
      </div>

      <OrdersTable
        orders={rows}
        total={total}
        page={filters.page}
        pageSize={PAGE_SIZE}
        filters={filters}
        statusCounts={statusCounts}
        canFulfill={canFulfill}
        canRefund={canRefund}
      />
    </div>
  );
}
