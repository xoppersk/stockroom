import type { Metadata } from "next";
import Link from "next/link";
import { Package } from "lucide-react";

import { currentRole } from "@/lib/auth/roles";
import { createProductsClient } from "@/lib/products/types";
import { formatPriceRange, resolveImageUrl } from "@/lib/products/utils";
import { EmptyState } from "@/components/app/empty-state";
import { ProductStatusBadge } from "@/components/products/product-status-badge";
import { ProductToolbar, type ProductView } from "@/components/products/product-toolbar";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Products" };

const PAGE_SIZE = 25;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchParams = {
  q?: string;
  category?: string;
  status?: string;
  view?: string;
  page?: string;
};

/** Escape PostgREST filter wildcards; strip chars that break the or() parser. */
function sanitizeTerm(raw: string): string {
  return raw
    .replace(/[%_\\]/g, "\\$&")
    .replace(/[,()]/g, "")
    .slice(0, 80);
}

function pageHref(base: URLSearchParams, page: number): string {
  const params = new URLSearchParams(base);
  if (page <= 1) params.delete("page");
  else params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/products?${qs}` : "/products";
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const role = await currentRole();
  const isAdmin = role === "admin";

  const q = (params.q ?? "").trim();
  const categoryFilter = UUID_PATTERN.test(params.category ?? "") ? (params.category as string) : "";
  const statusFilter = ["draft", "published", "archived"].includes(params.status ?? "")
    ? (params.status as "draft" | "published" | "archived")
    : "";
  const view: ProductView = params.view === "grid" ? "grid" : "list";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const supabase = await createProductsClient();

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .order("name");

  let query = supabase
    .from("products")
    .select(
      "id, title, slug, status, updated_at, categories(id, name), product_variants(id, sku, price, inventory_levels(quantity_on_hand, low_stock_threshold)), product_images(storage_path, position)",
      { count: "exact" },
    )
    .order("updated_at", { ascending: false })
    .order("position", { referencedTable: "product_images", ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (statusFilter) query = query.eq("status", statusFilter);
  if (categoryFilter) query = query.eq("category_id", categoryFilter);

  if (q) {
    const term = sanitizeTerm(q);
    if (term) {
      // SKU search needs the variants table: collect matching product ids first,
      // then filter products by title OR id — avoids duplicate rows from joins.
      const { data: skuHits } = await supabase
        .from("product_variants")
        .select("product_id")
        .ilike("sku", `%${term}%`);
      const ids = [...new Set((skuHits ?? []).map((r) => r.product_id))];
      query =
        ids.length > 0
          ? query.or(`title.ilike.%${term}%,id.in.(${ids.join(",")})`)
          : query.or(`title.ilike.%${term}%`);
    }
  }

  const { data, count } = await query;

  const products = (data ?? []).map((p) => {
    const variants = p.product_variants ?? [];
    const stockTotal = variants.reduce(
      (sum, v) => sum + (v.inventory_levels?.quantity_on_hand ?? 0),
      0,
    );
    const hasLow = variants.some((v) => {
      const inv = v.inventory_levels;
      return !!inv && inv.quantity_on_hand <= inv.low_stock_threshold;
    });
    const thumbnail = (p.product_images ?? [])[0]?.storage_path;
    return {
      id: p.id,
      title: p.title,
      status: p.status,
      categoryName: p.categories?.name ?? null,
      variantCount: variants.length,
      priceRange: formatPriceRange(variants.map((v) => v.price)),
      stockTotal,
      hasLow,
      thumbnail: thumbnail ? resolveImageUrl(thumbnail) : null,
      updatedAt: p.updated_at,
    };
  });

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const baseParams = new URLSearchParams();
  if (q) baseParams.set("q", q);
  if (categoryFilter) baseParams.set("category", categoryFilter);
  if (statusFilter) baseParams.set("status", statusFilter);
  if (view === "grid") baseParams.set("view", "grid");

  const hasActiveFilters = !!(q || categoryFilter || statusFilter);
  const from = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const to = Math.min(safePage * PAGE_SIZE, total);

  const pageNumbers: number[] = [];
  for (let n = Math.max(1, safePage - 2); n <= Math.min(totalPages, safePage + 2); n += 1) {
    pageNumbers.push(n);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Products</h1>
        <p className="text-muted-foreground">
          {total === 0
            ? "The catalog is empty."
            : `Showing ${from}–${to} of ${total} product${total === 1 ? "" : "s"}.`}
        </p>
      </div>

      <ProductToolbar
        categories={categories ?? []}
        q={q}
        category={categoryFilter}
        status={statusFilter}
        view={view}
        isAdmin={isAdmin}
        hasActiveFilters={hasActiveFilters}
      />

      {products.length === 0 ? (
        <EmptyState
          icon={Package}
          title={hasActiveFilters ? "No products match" : "No products yet"}
          description={
            hasActiveFilters
              ? "Try a different search term or clear the filters."
              : "Create your first product to start building the Juniper Supply Co. catalog."
          }
          action={
            hasActiveFilters ? (
              <Button variant="outline" asChild>
                <Link href="/products">Clear filters</Link>
              </Button>
            ) : isAdmin ? (
              <Button asChild>
                <Link href="/products/new">New product</Link>
              </Button>
            ) : undefined
          }
        />
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {products.map((p) => (
            <Link
              key={p.id}
              href={`/products/${p.id}`}
              className="group flex flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/40"
            >
              <div className="flex aspect-square items-center justify-center bg-muted">
                {p.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.thumbnail}
                    alt=""
                    className="size-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <Package className="size-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-medium group-hover:text-primary">{p.title}</p>
                </div>
                <ProductStatusBadge status={p.status} className="self-start" />
                <p className="mt-auto pt-1 text-sm font-semibold tabular-nums">{p.priceRange}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {p.variantCount} variant{p.variantCount === 1 ? "" : "s"} · {p.stockTotal} in stock
                  {p.hasLow && <span className="font-medium text-[#B45309]"> · low</span>}
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden rounded-lg border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id} className="h-14">
                    <TableCell>
                      <Link
                        href={`/products/${p.id}`}
                        className="flex items-center gap-3 font-medium hover:text-primary"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                          {p.thumbnail ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.thumbnail} alt="" className="size-full object-cover" loading="lazy" />
                          ) : (
                            <Package className="size-4 text-muted-foreground" />
                          )}
                        </span>
                        <span>
                          {p.title}
                          <span className="block text-xs font-normal text-muted-foreground">
                            {p.variantCount} variant{p.variantCount === 1 ? "" : "s"}
                          </span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <ProductStatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.categoryName ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{p.priceRange}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.stockTotal}
                      {p.hasLow && (
                        <span className="ml-1.5 rounded-full bg-[#B45309]/12 px-1.5 py-0.5 text-[11px] font-medium text-[#B45309]">
                          low
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {new Date(p.updatedAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <ul className="flex flex-col gap-2 md:hidden">
            {products.map((p) => (
              <li key={p.id} className="rounded-lg border bg-card">
                <Link href={`/products/${p.id}`} className="flex items-center gap-3 p-3">
                  <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                    {p.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.thumbnail} alt="" className="size-full object-cover" loading="lazy" />
                    ) : (
                      <Package className="size-5 text-muted-foreground" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.title}</span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <ProductStatusBadge status={p.status} />
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {p.stockTotal} in stock
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{p.priceRange}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-center gap-1">
          <Button variant="outline" size="sm" asChild disabled={safePage <= 1}>
            <Link href={pageHref(baseParams, safePage - 1)} aria-disabled={safePage <= 1}>
              Previous
            </Link>
          </Button>
          {pageNumbers.map((n) => (
            <Button
              key={n}
              variant={n === safePage ? "default" : "ghost"}
              size="sm"
              asChild
              className={cn("tabular-nums", n !== safePage && "text-muted-foreground")}
              aria-current={n === safePage ? "page" : undefined}
            >
              <Link href={pageHref(baseParams, n)}>{n}</Link>
            </Button>
          ))}
          <Button variant="outline" size="sm" asChild disabled={safePage >= totalPages}>
            <Link href={pageHref(baseParams, safePage + 1)} aria-disabled={safePage >= totalPages}>
              Next
            </Link>
          </Button>
        </nav>
      )}
    </div>
  );
}
