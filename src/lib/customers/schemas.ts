import { z } from "zod";

/**
 * Zod schemas for the Customers module (Phase 6).
 *
 * All schemas validate raw FormData values (strings), transforming empty
 * strings to null where the column is nullable. Server actions parse with
 * these before touching Supabase.
 */

const optionalEmail = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.string().email("Enter a valid email address.").nullable());

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.string().max(max).nullable());

export const customerSchema = z.object({
  first_name: z
    .string()
    .trim()
    .min(1, "First name is required.")
    .max(60, "First name is too long."),
  last_name: z.string().trim().max(60, "Last name is too long.").default(""),
  email: optionalEmail,
  phone: optionalText(40),
});

export type CustomerFormValues = z.infer<typeof customerSchema>;

export const addressSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Label is required.")
    .max(40, "Label is too long.")
    .default("shipping"),
  line1: z.string().trim().min(1, "Street address is required.").max(120),
  line2: optionalText(120),
  city: z.string().trim().min(1, "City is required.").max(80),
  region: z.string().trim().min(1, "State / region is required.").max(80),
  postal_code: z.string().trim().min(1, "Postal code is required.").max(20),
  country: z.string().trim().min(1, "Country is required.").max(60).default("US"),
});

export type AddressFormValues = z.infer<typeof addressSchema>;

export const noteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write something before saving the note.")
    .max(2000, "Notes are limited to 2000 characters."),
});

export type NoteFormValues = z.infer<typeof noteSchema>;

/** A single tag: letters, numbers, spaces, dashes. */
const TAG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,29}$/;

export const tagsSchema = z.object({
  tags: z
    .array(z.string().trim().min(1).max(30))
    .max(20, "A customer can have at most 20 tags.")
    .refine((tags) => tags.every((t) => TAG_PATTERN.test(t)), {
      message:
        "Tags may only contain letters, numbers, spaces, dashes, and underscores.",
    })
    .refine((tags) => new Set(tags.map((t) => t.toLowerCase())).size === tags.length, {
      message: "Tags must be unique.",
    }),
});

export type TagsFormValues = z.infer<typeof tagsSchema>;

/** Parse a comma-separated tag string from a form field into the tags schema. */
export function parseTagList(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}
