import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Json } from "@/lib/supabase/types";

/**
 * Privileged append-only writes (server actions only — never import from a
 * Client Component).
 *
 * `audit_log` and `notifications` deliberately have NO staff INSERT RLS
 * policies: the migrations write them exclusively inside SECURITY DEFINER
 * functions so staff clients can never forge entries. Server actions have
 * already re-checked the caller's role via `requireRole`, so they may append
 * here through the service-role client.
 *
 * Both writes are best-effort: a missing SUPABASE_SERVICE_ROLE_KEY must not
 * break the underlying mutation, but it is logged loudly on the server.
 */

export async function writeAuditEntry(params: {
  actorId: string | null;
  action: string;
  tableName: string;
  rowId: string;
  before?: Json | null;
  after?: Json | null;
}): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("audit_log").insert({
      actor_id: params.actorId,
      action: params.action,
      table_name: params.tableName,
      row_id: params.rowId,
      before: params.before ?? null,
      after: params.after ?? null,
    });
    if (error) {
      console.warn(`[audit] insert failed for ${params.action}: ${error.message}`);
    }
  } catch (error) {
    console.warn(
      `[audit] skipped for ${params.action}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

export async function writeNotification(params: {
  kind: "new_order" | "low_stock" | "refund_issued" | "order_cancelled";
  title: string;
  body?: string;
  link?: string | null;
  userId?: string | null;
}): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("notifications").insert({
      user_id: params.userId ?? null,
      kind: params.kind,
      title: params.title,
      body: params.body ?? "",
      link: params.link ?? null,
    });
    if (error) {
      console.warn(`[notifications] insert failed: ${error.message}`);
    }
  } catch (error) {
    console.warn(
      "[notifications] skipped:",
      error instanceof Error ? error.message : error,
    );
  }
}
