import { Suspense } from "react";
import { listAudit } from "@/lib/api";
import { normalizeAudit } from "../admin-data";
import AuditClient from "./AuditClient";

/* A-03 · /admin/settings/audit — signed, append-only history
   (AuditHistory.html). Data: @/lib/api listAudit(), with live entries
   from the client store's auditLog prepended on the client. */
export default async function AuditPage() {
  let raw: unknown = null;
  try {
    raw = await listAudit();
  } catch {
    raw = null;
  }
  const { entries, total, shown } = normalizeAudit(raw);
  return (
    <Suspense fallback={null}>
      <AuditClient entries={entries} total={total} shown={shown} />
    </Suspense>
  );
}
