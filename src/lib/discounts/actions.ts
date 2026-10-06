"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/roles";
import {
  ACTION_FAILURE,
  zodFieldErrors,
  type ActionState,
} from "@/lib/server-action";
import { buildNoteEntry } from "@/lib/customers/notes";
import { createClient } from "@/lib/supabase/server";

import {
  apologyCodeSchema,
  DISCOUNT_FAILURE_COPY,
  discountCodeSchema,
  discountSchema,
  validateCodeSchema,
  type DiscountFailureReason,
} from "./schemas";

/**
 * Server actions for the Discounts module (Phase 6).
 *
 * Role matrix (DATABASE-SCHEMA.md §3, TECHNICAL-REQUIREMENTS.md §6):
 *   admin   — full discount CRUD, pause/resume
 *   support — READ discounts + INSERT one-time apology codes only
 *             (the one-time/per-customer/percentage shape is enforced here;
 *              RLS has a matching `support_insert_apology` policy)
 *   warehouse — no access (pages redirect; these actions deny)
 */

export interface ValidateDiscountState extends ActionState {
  reason?: DiscountFailureReason;
  /** Human-readable explanation for the rejection (present when reason is). */
  message?: string;
  /** Present on success: the validated discount + computed savings. */
  result?: {
    code: string;
    kind: "percentage" | "fixed";
    value: number;
    min_order_value: number;
    discount_amount: number;
    new_subtotal: number;
  };
}

/** Map the SQL function's raised message to a distinct failure reason. */
function mapValidationError(message: string): {
  reason: DiscountFailureReason;
  message: string;
} {
  const m = message.toLowerCase();
  if (m.includes("was not found") || m.includes("is required"))
    return { reason: "invalid", message: DISCOUNT_FAILURE_COPY.invalid };
  if (m.includes("is paused")) return { reason: "paused", message: DISCOUNT_FAILURE_COPY.paused };
  if (m.includes("not active yet"))
    return { reason: "scheduled", message: DISCOUNT_FAILURE_COPY.scheduled };
  if (m.includes("has expired"))
    return { reason: "expired", message: DISCOUNT_FAILURE_COPY.expired };
  if (
    m.includes("usage limit") ||
    m.includes("maximum number of times for this customer")
  )
    return { reason: "limit-reached", message: DISCOUNT_FAILURE_COPY["limit-reached"] };
  if (m.includes("minimum order"))
    return { reason: "min-order-not-met", message: DISCOUNT_FAILURE_COPY["min-order-not-met"] };
  return { reason: "invalid", message };
}

export async function createDiscount(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { role } = await requireRole(["admin", "support"], "/discounts/new");

  // Support staff may only create apology codes (via the customer screen);
  // full campaign creation is admin-only.
  if (role !== "admin") {
    return {
      ...ACTION_FAILURE,
      error:
        "Only admins can create discount campaigns. You can issue one-time apology codes from a customer record.",
    };
  }

  const parsed = discountSchema.safeParse({
    code: formData.get("code"),
    kind: formData.get("kind"),
    value: formData.get("value"),
    usage_limit: formData.get("usage_limit"),
    per_customer_limit: formData.get("per_customer_limit"),
    min_order_value: formData.get("min_order_value"),
    starts_at: formData.get("starts_at"),
    ends_at: formData.get("ends_at"),
    start_paused: formData.get("start_paused"),
  });
  if (!parsed.success) return zodFieldErrors(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.from("discounts").insert({
    code: parsed.data.code,
    kind: parsed.data.kind,
    value: parsed.data.value,
    usage_limit: parsed.data.usage_limit,
    per_customer_limit: parsed.data.per_customer_limit,
    min_order_value: parsed.data.min_order_value,
    starts_at: new Date(parsed.data.starts_at).toISOString(),
    ends_at: parsed.data.ends_at ? new Date(parsed.data.ends_at).toISOString() : null,
    status: parsed.data.start_paused ? "paused" : "active",
  });

  if (error) {
    if (error.code === "23505") {
      return { ...ACTION_FAILURE, error: `Code "${parsed.data.code}" already exists.` };
    }
    return { ...ACTION_FAILURE, error: "Couldn't create the discount. Try again." };
  }

  revalidatePath("/discounts");
  redirect("/discounts");
}

/** Pause a discount mid-campaign: redemption stops immediately (Phase 6 DoD). */
export async function pauseDiscount(id: string): Promise<ActionState> {
  await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase
    .from("discounts")
    .update({ status: "paused" })
    .eq("id", id);
  if (error) return { ...ACTION_FAILURE, error: "Couldn't pause the discount." };
  revalidatePath("/discounts");
  return { ok: true };
}

export async function resumeDiscount(id: string): Promise<ActionState> {
  await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase
    .from("discounts")
    .update({ status: "active" })
    .eq("id", id);
  if (error) return { ...ACTION_FAILURE, error: "Couldn't resume the discount." };
  revalidatePath("/discounts");
  return { ok: true };
}

/** Delete a discount that has never been redeemed. Admin only. */
export async function deleteDiscount(id: string): Promise<ActionState> {
  await requireRole("admin");
  const supabase = await createClient();

  const { count } = await supabase
    .from("discount_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("discount_id", id);
  if ((count ?? 0) > 0) {
    return {
      ...ACTION_FAILURE,
      error: "This code has redemptions on record and can't be deleted. Pause it instead.",
    };
  }

  const { error } = await supabase.from("discounts").delete().eq("id", id);
  if (error) return { ...ACTION_FAILURE, error: "Couldn't delete the discount." };
  revalidatePath("/discounts");
  return { ok: true };
}

const APOLOGY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomApologyCode(): string {
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += APOLOGY_ALPHABET[Math.floor(Math.random() * APOLOGY_ALPHABET.length)];
  }
  return `SORRY-${suffix}`;
}

export interface ApologyCodeState extends ActionState {
  code?: string;
}

/**
 * Issue a one-time apology code for a customer (PRD user story 6,
 * APP-FLOW.md: one-time 15% apology code, valid 14 days, single use).
 *
 * Guardrails enforced here (DATABASE-SCHEMA.md §3): kind='percentage',
 * usage_limit=1, per_customer_limit=1. Support and admin may call this.
 */
export async function issueApologyCode(
  _prev: ApologyCodeState,
  formData: FormData,
): Promise<ApologyCodeState> {
  const { user } = await requireRole(["admin", "support"]);

  const parsed = apologyCodeSchema.safeParse({
    customer_id: formData.get("customer_id"),
    percent: formData.get("percent"),
  });
  if (!parsed.success) return zodFieldErrors(parsed.error);

  const supabase = await createClient();

  // Confirm the customer exists (and keep the code tied to them for the UI).
  const { data: customer } = await supabase
    .from("customers")
    .select("id, first_name, notes")
    .eq("id", parsed.data.customer_id)
    .maybeSingle();
  if (!customer) return { ...ACTION_FAILURE, error: "Customer not found." };

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + 14 * 24 * 60 * 60 * 1000);

  // Retry on the (very unlikely) code collision; the DB trigger uppercases.
  let code: string | null = null;
  for (let attempt = 0; attempt < 5 && code === null; attempt++) {
    const candidate = randomApologyCode();
    const { error } = await supabase.from("discounts").insert({
      code: candidate,
      kind: "percentage",
      value: parsed.data.percent,
      usage_limit: 1,
      per_customer_limit: 1,
      min_order_value: 0,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "active",
      created_by: user.id,
    });
    if (!error) {
      code = candidate;
    } else if (error.code !== "23505") {
      return { ...ACTION_FAILURE, error: "Couldn't issue the code. Try again." };
    }
  }

  if (!code) {
    return { ...ACTION_FAILURE, error: "Couldn't generate a unique code. Try again." };
  }

  // Paper trail on the customer record: the notes timeline is the case file.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  await supabase
    .from("customers")
    .update({
      notes: `${customer.notes}${buildNoteEntry(
        profile?.full_name ?? "Staff",
        `Issued one-time apology code ${code} (${parsed.data.percent}% off, single use, valid 14 days).`,
      )}`,
    })
    .eq("id", customer.id);

  revalidatePath("/discounts");
  revalidatePath(`/customers/${parsed.data.customer_id}`);
  return { ok: true, code };
}

/**
 * Test a discount code against `apply_discount_validation` and surface the
 * distinct failure reason (expired / limit-reached / min-order-not-met /
 * paused / scheduled / invalid). Used by the discounts page tester; the
 * orders phase calls the same function inside `create_order_with_items`.
 */
export async function validateDiscountCode(
  _prev: ValidateDiscountState,
  formData: FormData,
): Promise<ValidateDiscountState> {
  await requireRole(["admin", "support"]);

  const parsed = validateCodeSchema.safeParse({
    code: formData.get("code"),
    subtotal: formData.get("subtotal"),
    customer_id: formData.get("customer_id"),
  });
  if (!parsed.success) return zodFieldErrors(parsed.error);

  const code = discountCodeSchema.safeParse(parsed.data.code);
  if (!code.success) {
    return {
      ...ACTION_FAILURE,
      reason: "invalid",
      message: DISCOUNT_FAILURE_COPY.invalid,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_discount_validation", {
    p_code: code.data,
    p_subtotal: parsed.data.subtotal,
    p_customer_id: parsed.data.customer_id,
  });

  if (error || !data) {
    const mapped = mapValidationError(error?.message ?? "");
    return { ...ACTION_FAILURE, reason: mapped.reason, message: mapped.message };
  }

  const value = Number(data.value);
  const discountAmount =
    data.kind === "percentage"
      ? Math.min(parsed.data.subtotal, (parsed.data.subtotal * value) / 100)
      : Math.min(parsed.data.subtotal, value);

  return {
    ok: true,
    result: {
      code: data.code,
      kind: data.kind,
      value,
      min_order_value: Number(data.min_order_value),
      discount_amount: Math.round(discountAmount * 100) / 100,
      new_subtotal: Math.round((parsed.data.subtotal - discountAmount) * 100) / 100,
    },
  };
}
