"use client";

/**
 * New-product wizard: Details → Variants → Media → Review.
 *
 * Each step validates before advancing. The variant matrix (step 2) is the
 * hero interaction — see VariantMatrixBuilder. Finishing calls the
 * `createProduct` server action as either a draft or published product.
 */
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, TriangleAlert } from "lucide-react";

import { createProduct } from "@/lib/products/actions";
import type { CreateProductInput } from "@/lib/products/schemas";
import { formatMoney, formatPriceRange, resolveImageUrl, slugify } from "@/lib/products/utils";
import { VariantMatrixBuilder, type VariantRowState } from "@/components/products/variant-matrix-builder";
import { MediaManager } from "@/components/products/media-manager";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const STEPS = ["Details", "Variants", "Media", "Review"] as const;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseTags(input: string): string[] {
  return input
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function isValidNumber(value: string, integer = false): boolean {
  if (value.trim() === "") return false;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return false;
  return integer ? Number.isInteger(n) : true;
}

export function ProductWizard({ categories }: { categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; warning: string } | null>(null);

  // Step 1 — details
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [tagsInput, setTagsInput] = useState("");

  // Step 2 — variants
  const [rows, setRows] = useState<VariantRowState[]>([]);

  // Step 3 — media
  const [media, setMedia] = useState<{ url: string; alt: string }[]>([]);

  const skuPrefix = useMemo(() => {
    const prefix = slug
      .split("-")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 4);
    return prefix || "SKU";
  }, [slug]);

  function handleTitleChange(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function validateStep(current: number): string | null {
    if (current === 0) {
      if (!title.trim()) return "Give the product a title.";
      if (!SLUG_PATTERN.test(slug.trim()))
        return "Slug must use lowercase letters, numbers, and hyphens only.";
      return null;
    }
    if (current === 1) {
      if (rows.length === 0) return "Add at least one variant.";
      const seen = new Set<string>();
      for (const row of rows) {
        if (!row.title.trim()) return "Each variant needs a title.";
        if (!row.sku.trim()) return "Each variant needs a SKU.";
        if (!isValidNumber(row.price)) return `Price for "${row.title}" must be a number ≥ 0.`;
        if (row.compareAtPrice.trim() !== "" && !isValidNumber(row.compareAtPrice))
          return `Compare-at price for "${row.title}" must be a number ≥ 0.`;
        if (!isValidNumber(row.quantity, true)) return `Stock for "${row.title}" must be a whole number ≥ 0.`;
        if (!isValidNumber(row.threshold, true))
          return `Threshold for "${row.title}" must be a whole number ≥ 0.`;
        const key = row.sku.trim().toLowerCase();
        if (seen.has(key)) return `Duplicate SKU "${row.sku.trim()}".`;
        seen.add(key);
      }
      return null;
    }
    if (current === 2) {
      if (media.some((m) => m.url.trim() === "")) return "Remove empty image rows or add their URLs.";
      return null;
    }
    return null;
  }

  function goNext() {
    const problem = validateStep(step);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function submit(status: "draft" | "published") {
    for (const s of [0, 1, 2]) {
      const problem = validateStep(s);
      if (problem) {
        setError(problem);
        setStep(s);
        return;
      }
    }
    setError(null);

    const input: CreateProductInput = {
      details: {
        title: title.trim(),
        slug: slug.trim(),
        description: description.trim(),
        categoryId: categoryId || null,
        tags: parseTags(tagsInput),
      },
      variants: rows.map((r, i) => ({
        title: r.title.trim(),
        sku: r.sku.trim(),
        optionValues: r.optionValues,
        price: r.price.trim(),
        compareAtPrice: r.compareAtPrice.trim(),
        position: i,
        quantityOnHand: r.quantity.trim(),
        lowStockThreshold: r.threshold.trim(),
      })),
      images: media
        .filter((m) => m.url.trim() !== "")
        .map((m, i) => ({ url: m.url.trim(), altText: m.alt.trim(), position: i })),
      status,
    };

    startTransition(async () => {
      const result = await createProduct(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.warning) {
        setCreated({ id: result.id, warning: result.warning });
      } else {
        router.push(`/products/${result.id}`);
      }
    });
  }

  const categoryName = categories.find((c) => c.id === categoryId)?.name ?? "Uncategorized";

  return (
    <div className="flex flex-col gap-6">
      {/* Stepper — compresses to "Step X of 4" on mobile (Flagship UI Designs §2.7) */}
      <p className="text-sm font-medium text-muted-foreground tabular-nums sm:hidden" aria-live="polite">
        Step {step + 1} of {STEPS.length}: {STEPS[step]}
      </p>
      <ol className="hidden items-center gap-1 sm:flex sm:gap-2" aria-label="Progress">
        {STEPS.map((label, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <li key={label} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (i < step) setStep(i);
                }}
                disabled={i > step}
                className={cn(
                  "flex items-center gap-2 rounded-md px-1 py-2 text-sm",
                  i > step && "cursor-not-allowed opacity-50",
                )}
                aria-current={current ? "step" : undefined}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
                    done && "border-[#15803D] bg-[#15803D] text-white",
                    current && "border-primary bg-primary text-primary-foreground",
                    !done && !current && "border-border text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "hidden font-medium sm:inline",
                    current ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              </button>
              {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border" aria-hidden />}
            </li>
          );
        })}
      </ol>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-[#DC2626]/30 bg-[#DC2626]/8 px-4 py-3 text-sm text-[#DC2626]"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}

      {created && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-lg border border-[#B45309]/30 bg-[#B45309]/8 px-4 py-3 text-sm"
        >
          <p className="font-medium">Product created with a warning</p>
          <p className="text-muted-foreground">{created.warning}</p>
          <Link href={`/products/${created.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
            Open the product →
          </Link>
        </div>
      )}

      {/* Step 1 — Details */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="wz-title">Title</Label>
              <Input
                id="wz-title"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Juniper Throw Pillow"
                autoFocus
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="wz-slug">Slug</Label>
              <Input
                id="wz-slug"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugTouched(true);
                }}
                placeholder="juniper-throw-pillow"
                className="font-mono text-[13px]"
              />
              <p className="text-xs text-muted-foreground">
                Used in the storefront URL. Auto-generated from the title until you edit it.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="wz-description">Description</Label>
              <Textarea
                id="wz-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What makes this product worth buying?"
                rows={4}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="wz-category">Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger id="wz-category">
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
                <Label htmlFor="wz-tags">Tags (comma-separated)</Label>
                <Input
                  id="wz-tags"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="linen, bestseller, gift"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2 — Variants */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Variants</CardTitle>
          </CardHeader>
          <CardContent>
            <VariantMatrixBuilder skuPrefix={skuPrefix} onChange={setRows} showStockFields />
          </CardContent>
        </Card>
      )}

      {/* Step 3 — Media */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Media</CardTitle>
          </CardHeader>
          <CardContent>
            <MediaManager onChange={setMedia} />
          </CardContent>
        </Card>
      )}

      {/* Step 4 — Review */}
      {step === 3 && (
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Review</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Title</dt>
                  <dd className="font-medium">{title}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Slug</dt>
                  <dd className="font-mono text-[13px]">{slug}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Category</dt>
                  <dd>{categoryName}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Tags</dt>
                  <dd>{parseTags(tagsInput).join(", ") || "—"}</dd>
                </div>
              </dl>
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Variants · {rows.length} · {formatPriceRange(rows.map((r) => r.price || 0))}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {rows.map((r) => (
                  <li key={r.key} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.title}</p>
                      <p className="font-mono text-xs text-muted-foreground">{r.sku}</p>
                    </div>
                    <p className="shrink-0 text-right tabular-nums">
                      {formatMoney(r.price || 0)}
                      <span className="block text-xs text-muted-foreground">{r.quantity} in stock</span>
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {media.filter((m) => m.url.trim() !== "").length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Media · {media.filter((m) => m.url.trim() !== "").length}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {media
                    .filter((m) => m.url.trim() !== "")
                    .map((m, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={resolveImageUrl(m.url.trim())}
                        alt={m.alt || `Product image ${i + 1}`}
                        className="size-20 rounded-md border object-cover"
                      />
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => submit("draft")} disabled={pending}>
              Save draft
            </Button>
            <Button onClick={() => submit("published")} disabled={pending}>
              {pending ? "Saving…" : "Publish product"}
            </Button>
          </div>
        </div>
      )}

      {/* Nav */}
      {step < 3 && (
        <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t bg-background/95 py-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={step === 0 || pending}>
            <ArrowLeft className="size-4" />
            Back
          </Button>
          <Button onClick={goNext} disabled={pending}>
            Continue
            <ArrowRight className="size-4" />
          </Button>
        </div>
      )}
      {step === 3 && (
        <div className="sticky bottom-0 flex justify-start border-t bg-background/95 py-3 backdrop-blur md:hidden">
          <Button variant="outline" onClick={() => setStep(2)}>
            <ArrowLeft className="size-4" />
            Back to media
          </Button>
        </div>
      )}

    </div>
  );
}
