import { Suspense } from "react";
import { getConsoleActor, listConsoleAudit } from "@/lib/shop/admin";
import { buildAuditView } from "../admin-data";
import AuditClient from "./AuditClient";

/* A-03 · /admin/settings/audit — signed, append-only history
   (AuditHistory.html). Data: listConsoleAudit() over audit_log
   (admin-read RLS — non-admin staff honestly get the empty set and
   the page's restricted state). */
export default async function AuditPage() {
  const [list, actor] = await Promise.all([
    listConsoleAudit(),
    getConsoleActor(),
  ]);
  const { entries, total, shown } = buildAuditView(list);
  return (
    <Suspense fallback={null}>
      <AuditClient
        entries={entries}
        total={total}
        shown={shown}
        actorIsAdmin={actor.role === "admin"}
      />
    </Suspense>
  );
}
