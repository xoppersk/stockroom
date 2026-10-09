import type { Metadata } from "next";
import Link from "next/link";
import { Plus, TicketPercent } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DiscountRowActions } from "@/components/discounts/discount-row-actions";
import { DiscountStatusBadge } from "@/components/discounts/discount-status-badge";
import { ValidateCodeDialog } from "@/components/discounts/validate-code-dialog";
import { requireRole } from "@/lib/auth/roles";
import { formatDate, formatDiscountValue, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Discounts" };

/**
 * Discounts list (Phase 6): derived status (Active/Scheduled/Paused/Expired),
 * redemption counts, pause/resume (admin). Admin + support can read; only
 * admin sees the management controls.
 */
export default async function DiscountsPage() {
  const { role } = await requireRole(["admin", "support"], "/discounts");
  const isAdmin = role === "admin";

  const supabase = await createClient();
  const [{ data: discounts }, { data: redemptionRows }] = await Promise.all([
    supabase
      .from("discounts")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.from("discount_redemptions").select("discount_id"),
  ]);

  const list = discounts ?? [];
  const redemptionCount = new Map<string, number>();
  for (const row of redemptionRows ?? []) {
    redemptionCount.set(
      row.discount_id,
      (redemptionCount.get(row.discount_id) ?? 0) + 1,
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Discounts</h1>
          <p className="text-muted-foreground">
            {list.length} {list.length === 1 ? "code" : "codes"}. Status is
            derived from schedule, limits, and pause state.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ValidateCodeDialog />
          {isAdmin ? (
            <Button asChild>
              <Link href="/discounts/new">
                <Plus className="size-4" /> New discount
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={TicketPercent}
          title="No discount codes yet"
          description="Create a campaign code — or issue a one-time apology code from a customer record."
          action={
            isAdmin ? (
              <Button asChild>
                <Link href="/discounts/new">
                  <Plus className="size-4" /> New discount
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
                    <TableHead>Code</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Redeemed</TableHead>
                    <TableHead className="text-right">Min. order</TableHead>
                    <TableHead>Window</TableHead>
                    {isAdmin ? <TableHead className="text-right">Actions</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((discount) => {
                    const used = redemptionCount.get(discount.id) ?? 0;
                    return (
                      <TableRow key={discount.id} className="h-14">
                        <TableCell className="font-mono font-semibold">
                          {discount.code}
                        </TableCell>
                        <TableCell>
                          {formatDiscountValue(discount.kind, discount.value)}
                        </TableCell>
                        <TableCell>
                          <DiscountStatusBadge
                            discount={discount}
                            redemptionCount={used}
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <div>
                            {used}
                            {discount.usage_limit ? (
                              <span className="text-muted-foreground">
                                {" "}
                                / {discount.usage_limit}
                              </span>
                            ) : null}
                          </div>
                          {discount.usage_limit ? (
                            <Progress
                              value={Math.min(100, (used / discount.usage_limit) * 100)}
                              className="ml-auto mt-1.5 w-20"
                              aria-label={`${used} of ${discount.usage_limit} redemptions used`}
                            />
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(discount.min_order_value) > 0
                            ? formatMoney(discount.min_order_value)
                            : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDate(discount.starts_at)} →{" "}
                          {discount.ends_at ? formatDate(discount.ends_at) : "No end"}
                        </TableCell>
                        {isAdmin ? (
                          <TableCell>
                            <DiscountRowActions
                              id={discount.id}
                              code={discount.code}
                              paused={discount.status === "paused"}
                              canDelete={used === 0}
                            />
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Mobile cards */}
          <div className="grid gap-3 md:hidden">
            {list.map((discount) => {
              const used = redemptionCount.get(discount.id) ?? 0;
              return (
                <Card key={discount.id}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono font-semibold">{discount.code}</p>
                      <DiscountStatusBadge
                        discount={discount}
                        redemptionCount={used}
                      />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {formatDiscountValue(discount.kind, discount.value)}
                      </span>
                      <span className="tabular-nums">
                        {used}
                        {discount.usage_limit ? ` / ${discount.usage_limit}` : ""}{" "}
                        redeemed
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(discount.starts_at)} →{" "}
                      {discount.ends_at ? formatDate(discount.ends_at) : "No end"}
                      {Number(discount.min_order_value) > 0
                        ? ` · min ${formatMoney(discount.min_order_value)}`
                        : ""}
                    </p>
                    {isAdmin ? (
                      <div className="flex justify-end border-t pt-2">
                        <DiscountRowActions
                          id={discount.id}
                          code={discount.code}
                          paused={discount.status === "paused"}
                          canDelete={used === 0}
                        />
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {!isAdmin ? (
        <p className="text-sm text-muted-foreground">
          Support staff can read codes and test them, and issue one-time apology
          codes from a customer record. Campaign management is admin-only.
        </p>
      ) : null}
    </div>
  );
}
