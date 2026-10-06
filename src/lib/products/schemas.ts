/**
 * Zod validation for the product catalog (Phase 3).
 *
 * Every product server action parses its input through these schemas first —
 * client components send plain serializable objects (never FormData, since the
 * variant matrix is nested), so the exported `*Input` types describe exactly
 * what the client may send.
 */
import { z } from "zod";

export const PRODUCT_STATUSES = ["draft", "published", "archived"] as const;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** Empty select value / missing value → null (for optional FKs). */
const nullableUuid = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.string().uuid("Pick a valid category.").nullable(),
);

/** Empty text input → null (for optional numerics). */
const nullableNumber = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? null : v),
  z.coerce.number().min(0, "Can't be negative.").nullable(),
);

export const productDetailsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give the product a title.")
    .max(200, "Keep the title under 200 characters."),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required.")
    .max(200, "Keep the slug under 200 characters.")
    .regex(SLUG_PATTERN, "Use lowercase letters, numbers, and hyphens only."),
  description: z.string().trim().max(5000, "Keep the description under 5,000 characters.").default(""),
  categoryId: nullableUuid,
  tags: z.array(z.string().trim().min(1).max(40)).max(20, "Keep it to 20 tags.").default([]),
});

export const variantInputSchema = z.object({
  /** Present when editing an existing variant; absent for new rows. */
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, "Each variant needs a title.").max(160),
  sku: z
    .string()
    .trim()
    .min(1, "Each variant needs a SKU.")
    .max(64, "Keep SKUs under 64 characters.")
    .regex(SKU_PATTERN, "SKUs may use letters, numbers, hyphens, and underscores."),
  optionValues: z.record(z.string().min(1), z.string().min(1)).default({}),
  price: z.coerce.number().min(0, "Price can't be negative.").max(99_999_999.99),
  compareAtPrice: nullableNumber,
  position: z.number().int().min(0).default(0),
  /** Opening stock — only applied when the variant is created. */
  quantityOnHand: z.coerce.number().int().min(0, "Stock can't be negative.").max(1_000_000_000).default(0),
  lowStockThreshold: z.coerce.number().int().min(0, "Threshold can't be negative.").max(1_000_000_000).default(10),
});

export const imageInputSchema = z.object({
  /** Full https:// URL (v1) or a path inside the `product-images` bucket. */
  url: z.string().trim().min(1, "Image URL can't be empty.").max(2048),
  altText: z.string().trim().max(200, "Keep alt text under 200 characters.").default(""),
  position: z.number().int().min(0).default(0),
});

function refineUniqueSkus<T extends { variants: { sku: string }[] }>(schema: z.ZodType<T>) {
  return schema.superRefine((data, ctx) => {
    const seen = new Set<string>();
    data.variants.forEach((v, i) => {
      const key = v.sku.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate SKU "${v.sku}" — SKUs must be unique.`,
          path: ["variants", i, "sku"],
        });
      } else {
        seen.add(key);
      }
    });
  });
}

const baseCreateSchema = z.object({
  details: productDetailsSchema,
  variants: z.array(variantInputSchema).min(1, "Add at least one variant.").max(200),
  images: z.array(imageInputSchema).max(20, "Keep it to 20 images.").default([]),
  status: z.enum(PRODUCT_STATUSES),
});

export const createProductSchema = refineUniqueSkus(baseCreateSchema);

export const updateProductSchema = z.object({
  details: productDetailsSchema,
});

export const upsertVariantsSchema = refineUniqueSkus(
  z.object({
    productId: z.string().uuid(),
    variants: z.array(variantInputSchema).min(1, "Keep at least one variant.").max(200),
  }),
);

export const setProductImagesSchema = z.object({
  productId: z.string().uuid(),
  images: z.array(imageInputSchema).max(20, "Keep it to 20 images."),
});

/* ------------------------------------------------------------------ */
/* Inferred types                                                      */
/* ------------------------------------------------------------------ */

/** What the client sends to `createProduct` (pre-coercion). */
export type CreateProductInput = z.input<typeof createProductSchema>;
/** Validated payload inside the action (post-coercion). */
export type CreateProductData = z.output<typeof createProductSchema>;

export type UpdateProductInput = z.input<typeof updateProductSchema>;
export type UpdateProductData = z.output<typeof updateProductSchema>;

export type UpsertVariantsInput = z.input<typeof upsertVariantsSchema>;
export type UpsertVariantsData = z.output<typeof upsertVariantsSchema>;

export type SetProductImagesInput = z.input<typeof setProductImagesSchema>;
export type SetProductImagesData = z.output<typeof setProductImagesSchema>;

export type VariantInput = z.input<typeof variantInputSchema>;
export type VariantData = z.output<typeof variantInputSchema>;

export type ImageInput = z.input<typeof imageInputSchema>;
export type ImageData = z.output<typeof imageInputSchema>;

export type ProductDetailsData = z.output<typeof productDetailsSchema>;
