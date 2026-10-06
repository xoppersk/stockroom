import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { NewOrderForm, type CustomerOption, type VariantOption } from "@/components/orders/new-order-form";
import { toCents } from "@/lib/money";

export const metadata: Metadata = { title: "New order" };

/**
 * Manual order flow (Phase 4) — admin/support only. The warehouse role is
 * redirected: creating orders isn't in its lane.
 */
export default async function NewOrderPage() {
  await requireRole(["admin", "support"], "/orders/new");
  const supabase = await createClient();

  const { data: customers } = await supabase
    .from("customers")
    .select("id, first_name, last_name, email")
    .order("first_name")
    .limit(500);

  const customerOptions: CustomerOption[] = (customers ?? []).map((c) => ({
    id: c.id,
    name: `${c.first_name} ${c.last_name}`.trim(),
    email: c.email ?? "",
  }));

  // Only published products are sellable (the RPC enforces this too).
  const { data: products } = await supabase
    .from("products")
    .select("id, title")
    .eq("status", "published")
    .order("title")
    .limit(200);
  const productIds = (products ?? []).map((p) => p.id);
  const productTitle = new Map((products ?? []).map((p) => [p.id, p.title]));

  const { data: variants } = productIds.length > 0
    ? await supabase
        .from("product_variants")
        .select("id, sku, title, price, product_id")
        .in("product_id", productIds)
        .order("sku")
        .limit(1000)
    : { data: null };
  const variantIds = (variants ?? []).map((v) => v.id);

  const { data: levels } = variantIds.length > 0
    ? await supabase.from("inventory_levels").select("variant_id, quantity_on_hand").in("variant_id", variantIds)
    : { data: null };
  const stockOf = new Map((levels ?? []).map((l) => [l.variant_id, l.quantity_on_hand]));

  const variantOptions: VariantOption[] = (variants ?? []).map((v) => ({
    id: v.id,
    sku: v.sku,
    title: v.title,
    productTitle: productTitle.get(v.product_id) ?? "Unknown product",
    priceCents: toCents(v.price),
    stock: stockOf.get(v.id) ?? 0,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/orders"
          className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Orders
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">New order</h1>
        <p className="text-muted-foreground">
          Create an order on a customer&apos;s behalf. Stock is reserved the moment you submit.
        </p>
      </div>

      <NewOrderForm customers={customerOptions} variants={variantOptions} />
    </div>
  );
}
