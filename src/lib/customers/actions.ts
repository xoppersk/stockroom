"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

import { ACTION_FAILURE, zodFieldErrors, type ActionState } from "@/lib/server-action";

import { buildNoteEntry } from "./notes";
import {
  addressSchema,
  customerSchema,
  noteSchema,
  parseTagList,
  tagsSchema,
} from "./schemas";

/**
 * Server actions for the Customers module (Phase 6).
 *
 * Role matrix (DATABASE-SCHEMA.md §3): customers + customer_addresses are
 * writable by admin and support. Every action re-checks the role
 * server-side — the UI gating on the pages is a convenience, not the
 * enforcement.
 */

async function actorName(userId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  return data?.full_name ?? "Staff";
}

/** Friendly message for the case-insensitive email unique index. */
async function emailTaken(
  email: string | null,
  excludeId?: string,
): Promise<boolean> {
  if (!email) return false;
  const supabase = await createClient();
  let query = supabase
    .from("customers")
    .select("id")
    .ilike("email", email)
    .limit(1);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query.maybeSingle();
  return data !== null;
}

export async function createCustomer(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["admin", "support"], "/customers/new");

  const parsed = customerSchema.safeParse({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) return zodFieldErrors(parsed.error);

  if (await emailTaken(parsed.data.email)) {
    return { ...ACTION_FAILURE, error: "A customer with this email already exists." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      email: parsed.data.email,
      phone: parsed.data.phone,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { ...ACTION_FAILURE, error: "A customer with this email already exists." };
    }
    return { ...ACTION_FAILURE, error: "Couldn't create the customer. Try again." };
  }

  revalidatePath("/customers");
  redirect(`/customers/${data.id}`);
}

export async function updateCustomer(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requireRole(["admin", "support"]);
  void user;

  const id = String(formData.get("id") ?? "");
  const parsed = customerSchema.safeParse({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) return zodFieldErrors(parsed.error);

  if (await emailTaken(parsed.data.email, id)) {
    return { ...ACTION_FAILURE, error: "A customer with this email already exists." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      email: parsed.data.email,
      phone: parsed.data.phone,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { ...ACTION_FAILURE, error: "A customer with this email already exists." };
    }
    return { ...ACTION_FAILURE, error: "Couldn't save the customer. Try again." };
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { ok: true };
}

export async function updateCustomerTags(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["admin", "support"]);

  const id = String(formData.get("id") ?? "");
  const parsed = tagsSchema.safeParse({
    tags: parseTagList(String(formData.get("tags") ?? "")),
  });
  if (!parsed.success) return zodFieldErrors(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({ tags: parsed.data.tags })
    .eq("id", id);

  if (error) return { ...ACTION_FAILURE, error: "Couldn't save the tags. Try again." };

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { ok: true };
}

export async function addAddress(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["admin", "support"]);

  const customerId = String(formData.get("customer_id") ?? "");
  const parsed = addressSchema.safeParse({
    label: formData.get("label"),
    line1: formData.get("line1"),
    line2: formData.get("line2"),
    city: formData.get("city"),
    region: formData.get("region"),
    postal_code: formData.get("postal_code"),
    country: formData.get("country"),
  });
  if (!parsed.success) return zodFieldErrors(parsed.error);

  const supabase = await createClient();
  const makeDefault = formData.get("is_default") === "on";

  if (makeDefault) {
    await supabase
      .from("customer_addresses")
      .update({ is_default: false })
      .eq("customer_id", customerId);
  }

  const { error } = await supabase.from("customer_addresses").insert({
    customer_id: customerId,
    label: parsed.data.label,
    line1: parsed.data.line1,
    line2: parsed.data.line2,
    city: parsed.data.city,
    region: parsed.data.region,
    postal_code: parsed.data.postal_code,
    country: parsed.data.country,
    is_default: makeDefault,
  });

  if (error) return { ...ACTION_FAILURE, error: "Couldn't save the address. Try again." };

  revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}

export async function updateAddress(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["admin", "support"]);

  const id = String(formData.get("id") ?? "");
  const customerId = String(formData.get("customer_id") ?? "");
  const parsed = addressSchema.safeParse({
    label: formData.get("label"),
    line1: formData.get("line1"),
    line2: formData.get("line2"),
    city: formData.get("city"),
    region: formData.get("region"),
    postal_code: formData.get("postal_code"),
    country: formData.get("country"),
  });
  if (!parsed.success) return zodFieldErrors(parsed.error);

  const supabase = await createClient();
  const makeDefault = formData.get("is_default") === "on";

  if (makeDefault) {
    await supabase
      .from("customer_addresses")
      .update({ is_default: false })
      .eq("customer_id", customerId);
  }

  const { error } = await supabase
    .from("customer_addresses")
    .update({
      label: parsed.data.label,
      line1: parsed.data.line1,
      line2: parsed.data.line2,
      city: parsed.data.city,
      region: parsed.data.region,
      postal_code: parsed.data.postal_code,
      country: parsed.data.country,
      is_default: makeDefault,
    })
    .eq("id", id);

  if (error) return { ...ACTION_FAILURE, error: "Couldn't save the address. Try again." };

  revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}

export async function deleteAddress(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["admin", "support"]);

  const id = String(formData.get("id") ?? "");
  const customerId = String(formData.get("customer_id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase
    .from("customer_addresses")
    .delete()
    .eq("id", id);

  if (error) return { ...ACTION_FAILURE, error: "Couldn't delete the address. Try again." };

  revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}

export async function setDefaultAddress(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["admin", "support"]);

  const id = String(formData.get("id") ?? "");
  const customerId = String(formData.get("customer_id") ?? "");

  const supabase = await createClient();
  const { error: clearError } = await supabase
    .from("customer_addresses")
    .update({ is_default: false })
    .eq("customer_id", customerId);
  if (clearError) return { ...ACTION_FAILURE, error: "Couldn't update the default address." };

  const { error } = await supabase
    .from("customer_addresses")
    .update({ is_default: true })
    .eq("id", id);
  if (error) return { ...ACTION_FAILURE, error: "Couldn't update the default address." };

  revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}

export async function appendCustomerNote(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requireRole(["admin", "support"]);

  const id = String(formData.get("id") ?? "");
  const parsed = noteSchema.safeParse({ body: formData.get("body") });
  if (!parsed.success) return zodFieldErrors(parsed.error);

  const supabase = await createClient();
  const { data: customer, error: readError } = await supabase
    .from("customers")
    .select("notes")
    .eq("id", id)
    .single();
  if (readError || !customer) {
    return { ...ACTION_FAILURE, error: "Customer not found." };
  }

  const name = await actorName(user.id);
  const { error } = await supabase
    .from("customers")
    .update({ notes: `${customer.notes}${buildNoteEntry(name, parsed.data.body)}` })
    .eq("id", id);

  if (error) return { ...ACTION_FAILURE, error: "Couldn't save the note. Try again." };

  revalidatePath(`/customers/${id}`);
  return { ok: true };
}

export async function deleteCustomer(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["admin", "support"]);

  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  // Deleting a customer with orders would orphan order history; orders keep a
  // NULL customer via on delete set null, but we block when paid/fulfilled
  // orders exist to protect the books.
  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", id)
    .in("status", ["paid", "fulfilled", "refunded"]);

  if ((count ?? 0) > 0) {
    return {
      ...ACTION_FAILURE,
      error:
        "This customer has completed orders, so they can't be deleted. Remove their personal details instead.",
    };
  }

  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) return { ...ACTION_FAILURE, error: "Couldn't delete the customer. Try again." };

  revalidatePath("/customers");
  redirect("/customers");
}
