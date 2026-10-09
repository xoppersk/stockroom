"use client";

/**
 * Tabbed product editor: Details, Variants, Media, Inventory, History.
 *
 * Admins get full editing (every mutation goes through the admin-only server
 * actions). Non-admin staff see a read-only view — the Inventory tab is
 * read-only for everyone because stock adjustments belong to the inventory
 * team, and the History tab (audit_log) is admin-only per RLS.
 */
import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { toast } from "@/lib/toast";

import {
  archiveProduct,
  duplicateProduct,
  publishProduct,
  setProductImages,
  unpublishProduct,
  updateProduct,
  upsertVariants,
} from "@/lib/products/actions";
import { formatMoney, optionKey, resolveImageUrl } from "@/lib/products/utils";
import type { ProductStatus } from "@/lib/products/types";
import { MediaManager } from "@/components/products/media-manager";
import { ProductStatusBadge } from "@/components/products/product-status-badge";
import { StockPill } from "@/components/products/stock-pill";
import type { VariantRowState } from "@/components/products/variant-matrix-builder";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface EditorVariant extends VariantRowState {
  stock: { quantity: number; threshold: number } | null;
}

export interface HistoryEntry {
  id: number;
  action: string;
  tableName: string;
  createdAt: string;
  actorName: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

interface ProductEditorProps {
  product: {
    id: string;
    title: string;
    slug: string;
    description: string;
    categoryId: string | null;
    tags: string[];
    status: ProductStatus;
    updatedAt: string;
  };
  categories: { id: string; name: string }[];
  variants: EditorVariant[];
  images: { url: string; alt: string }[];
  history: HistoryEntry[];
  isAdmin: boolean;
}

type Notice = { type: "ok" | "error"; message: string } | null;

/**
 * The variant matrix builder is the heaviest editor tab — it ships as a
 * separate chunk that loads when the Variants tab renders, keeping this
 * route inside the per-route JS budget.
 */
const VariantMatrixBuilder = dynamic(
  () =>
    import("@/components/products/variant-matrix-builder").then(
      (m) => m.VariantMatrixBuilder,
    ),
  {
    loading: () => (
      <p className="text-sm text-muted-foreground">Loading variant builder…</p>
    ),
  },
);

function prettifyAction(action: string): string {
  return action
    .split(/[._-]/)
    .map((w) => (w ? w[0]?.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function ProductEditor({
  product,
  categories,
  variants,
  images,
  history,
  isAdmin,
}: ProductEditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice>(null);

  // Details form state
  const [title, setTitle] = useState(product.title);
  const [slug, setSlug] = useState(product.slug);
  const [description, setDescription] = useState(product.description);
  const [categoryId, setCategoryId] = useState(product.categoryId ?? "");
  const [tagsInput, setTagsInput] = useState(product.tags.join(", "));

  // Variants + media state (lifted from the builders)
  const [rows, setRows] = useState<VariantRowState[]>([]);
  const [media, setMedia] = useState<{ url: string; alt: string }[]>(images);

  const stockByKey: Record<string, { quantity: number; threshold: number }> = {};
  for (const v of variants) {
    if (v.stock) stockByKey[optionKey(v.optionValues)] = v.stock;
  }

  function run(action: () => Promise<{ ok: boolean; error?: string; id?: string; warning?: string }>, okMessage: string) {
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setNotice({ type: "error", message: result.error ?? "Something went wrong." });
        return;
      }
      toast.success(result.warning ? `${okMessage} Warning: ${result.warning}` : okMessage);
      router.refresh();
    });
  }

  function saveDetails() {
    if (!title.trim()) {
      setNotice({ type: "error", message: "Title can't be empty." });
      return;
    }
    run(
      () =>
        updateProduct(product.id, {
          details: {
            title: title.trim(),
            slug: slug.trim(),
            description: description.trim(),
            categoryId: categoryId || null,
            tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
          },
        }),
      "Details saved.",
    );
  }

  function saveVariants() {
    for (const row of rows) {
      if (!row.title.trim() || !row.sku.trim()) {
        setNotice({ type: "error", message: "Each variant needs a title and a SKU." });
        return;
      }
      const price = Number(row.price);
      if (row.price.trim() === "" || !Number.isFinite(price) || price < 0) {
        setNotice({ type: "error", message: `Price for "${row.title}" must be a number ≥ 0.` });
        return;
      }
    }
    const seen = new Set<string>();
    for (const row of rows) {
      const key = row.sku.trim().toLowerCase();
      if (seen.has(key)) {
        setNotice({ type: "error", message: `Duplicate SKU "${row.sku.trim()}".` });
        return;
      }
      seen.add(key);
    }
    run(
      () =>
        upsertVariants({
          productId: product.id,
          variants: rows.map((r, i) => ({
            ...(r.id ? { id: r.id } : {}),
            title: r.title.trim(),
            sku: r.sku.trim(),
            optionValues: r.optionValues,
            price: r.price.trim(),
            compareAtPrice: r.compareAtPrice.trim(),
            position: i,
          })),
        }),
      "Variants saved. New variants start at 0 stock — adjust them in Inventory.",
    );
  }

  function saveMedia() {
    if (media.some((m) => m.url.trim() === "")) {
      setNotice({ type: "error", message: "Remove empty image rows or add their URLs." });
      return;
    }
    run(
      () =>
        setProductImages({
          productId: product.id,
          images: media.map((m, i) => ({ url: m.url.trim(), altText: m.alt.trim(), position: i })),
        }),
      "Gallery saved.",
    );
  }

  function confirmAndRun(message: string, action: () => Promise<{ ok: boolean; error?: string }>, okMessage: string) {
    if (!window.confirm(message)) return;
    run(action, okMessage);
  }

  return (
    <div className="flex flex-col gap-4">
      {notice && (
        <div
          role={notice.type === "error" ? "alert" : "status"}
          className={cn(
            "flex items-start gap-2 rounded-lg border px-4 py-3 text-sm",
            notice.type === "error"
              ? "border-[#DC2626]/30 bg-[#DC2626]/8 text-[#DC2626]"
              : "border-[#15803D]/30 bg-[#15803D]/8 text-[#15803D]",
          )}
        >
          {notice.type === "error" ? (
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          )}
          {notice.message}
        </div>
      )}

      <Tabs defaultValue="details" className="flex flex-col gap-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="variants">Variants · {variants.length}</TabsTrigger>
          <TabsTrigger value="media">Media · {images.length}</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          {isAdmin && <TabsTrigger value="history">History</TabsTrigger>}
        </TabsList>

        {/* ------------------------------ Details ------------------------------ */}
        <TabsContent value="details">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle>Details</CardTitle>
              <ProductStatusBadge status={product.status} />
            </CardHeader>
            <CardContent className="grid gap-4">
              {isAdmin ? (
                <>
                  <div className="grid gap-1.5">
                    <Label htmlFor="ed-title">Title</Label>
                    <Input id="ed-title" value={title} onChange={(e) => setTitle(e.target.value)} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="ed-slug">Slug</Label>
                    <Input
                      id="ed-slug"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      className="font-mono text-[13px]"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="ed-description">Description</Label>
                    <Textarea
                      id="ed-description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label htmlFor="ed-category">Category</Label>
                      <Select value={categoryId} onValueChange={setCategoryId}>
                        <SelectTrigger id="ed-category">
                          <SelectValue placeholder="Uncategorized" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="ed-tags">Tags (comma-separated)</Label>
                      <Input
                        id="ed-tags"
                        value={tagsInput}
                        onChange={(e) => setTagsInput(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <Button onClick={saveDetails} disabled={pending}>
                      {pending ? "Saving…" : "Save details"}
                    </Button>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-4">
                    <span className="w-full text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Publishing
                    </span>
                    {product.status !== "published" && (
                      <Button variant="outline" disabled={pending} onClick={() => run(() => publishProduct(product.id), "Product published.")}>
                        Publish
                      </Button>
                    )}
                    {product.status === "published" && (
                      <Button variant="outline" disabled={pending} onClick={() => run(() => unpublishProduct(product.id), "Product moved back to draft.")}>
                        Unpublish
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        confirmAndRun(
                          "Duplicate this product as a new draft?",
                          () => duplicateProduct(product.id),
                          "Product duplicated as a draft.",
                        )
                      }
                    >
                      Duplicate
                    </Button>
                    {product.status !== "archived" && (
                      <Button
                        variant="destructive"
                        disabled={pending}
                        onClick={() =>
                          confirmAndRun(
                            "Archive this product? It will disappear from sellable lists, but variants, stock, and order history are kept.",
                            () => archiveProduct(product.id),
                            "Product archived.",
                          )
                        }
                      >
                        Archive
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Title</dt>
                    <dd className="font-medium">{product.title}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Slug</dt>
                    <dd className="font-mono text-[13px]">{product.slug}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Category</dt>
                    <dd>{categories.find((c) => c.id === product.categoryId)?.name ?? "Uncategorized"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Tags</dt>
                    <dd>{product.tags.join(", ") || "—"}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Description</dt>
                    <dd className="text-muted-foreground">{product.description || "—"}</dd>
                  </div>
                </dl>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------ Variants ------------------------------ */}
        <TabsContent value="variants">
          <Card>
            <CardHeader>
              <CardTitle>Variants</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {isAdmin ? (
                <>
                  <VariantMatrixBuilder
                    skuPrefix={
                      product.slug.split("-").map((w) => w[0]).join("").toUpperCase().slice(0, 4) || "SKU"
                    }
                    initialRows={variants}
                    stockByKey={stockByKey}
                    onChange={setRows}
                  />
                  <div className="flex items-center gap-3">
                    <Button onClick={saveVariants} disabled={pending}>
                      {pending ? "Saving…" : "Save variants"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      New variants start at 0 stock. Stock moves happen in Inventory.
                    </p>
                  </div>
                </>
              ) : (
                <ul className="divide-y text-sm">
                  {variants.map((v) => (
                    <li key={v.key} className="flex items-center justify-between gap-3 py-2.5">
                      <div>
                        <p className="font-medium">{v.title}</p>
                        <p className="font-mono text-xs text-muted-foreground">{v.sku}</p>
                      </div>
                      <p className="text-right font-medium tabular-nums">{formatMoney(v.price)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------ Media ------------------------------ */}
        <TabsContent value="media">
          <Card>
            <CardHeader>
              <CardTitle>Media</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {isAdmin ? (
                <>
                  <MediaManager initial={images} onChange={setMedia} />
                  <Button onClick={saveMedia} disabled={pending} className="self-start">
                    {pending ? "Saving…" : "Save gallery"}
                  </Button>
                </>
              ) : images.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {images.map((img, i) => (
                    <figure key={i} className="overflow-hidden rounded-lg border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={resolveImageUrl(img.url)}
                        alt={img.alt || `Product image ${i + 1}`}
                        className="aspect-square w-full object-cover"
                      />
                    </figure>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No images.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------ Inventory ------------------------------ */}
        <TabsContent value="inventory">
          <Card>
            <CardHeader>
              <CardTitle>Inventory</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Read-only here — stock adjustments are made by the inventory team in{" "}
                <Link href="/inventory" className="font-medium text-primary underline-offset-4 hover:underline">
                  Inventory
                </Link>
                .
              </p>
              {/* Desktop table */}
              <div className="hidden md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 pr-4 font-medium text-muted-foreground">Variant</th>
                      <th className="py-2 pr-4 font-medium text-muted-foreground">SKU</th>
                      <th className="py-2 pr-4 text-right font-medium text-muted-foreground">On hand</th>
                      <th className="py-2 pr-4 text-right font-medium text-muted-foreground">Threshold</th>
                      <th className="py-2 text-right font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variants.map((v) => (
                      <tr key={v.key} className="border-b last:border-0">
                        <td className="py-2.5 pr-4 font-medium">{v.title}</td>
                        <td className="py-2.5 pr-4 font-mono text-[13px] text-muted-foreground">{v.sku}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">{v.stock?.quantity ?? "—"}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">{v.stock?.threshold ?? "—"}</td>
                        <td className="py-2.5 text-right">
                          {v.stock ? (
                            <StockPill quantity={v.stock.quantity} threshold={v.stock.threshold} />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile cards */}
              <ul className="flex flex-col gap-2 md:hidden">
                {variants.map((v) => (
                  <li key={v.key} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{v.title}</p>
                      <p className="font-mono text-xs text-muted-foreground">{v.sku}</p>
                    </div>
                    {v.stock ? (
                      <StockPill quantity={v.stock.quantity} threshold={v.stock.threshold} />
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------ History ------------------------------ */}
        {isAdmin && (
          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>History</CardTitle>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No audit entries yet. Product edits write to the audit log once the
                    catalog audit function lands; stock moves already appear here.
                  </p>
                ) : (
                  <ol className="flex flex-col gap-0">
                    {history.map((h) => (
                      <li key={h.id} className="flex gap-3 border-l-2 border-border py-3 pl-4">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{prettifyAction(h.action)}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(h.createdAt).toLocaleString()} · {h.actorName ?? "System"}
                            {h.tableName === "product_variants" ? " · variant" : ""}
                          </p>
                          {(h.before || h.after) && (
                            <details className="mt-1 text-xs">
                              <summary className="cursor-pointer text-muted-foreground">Changes</summary>
                              <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 font-mono text-[11px]">
                                {JSON.stringify({ before: h.before, after: h.after }, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
