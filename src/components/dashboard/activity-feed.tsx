import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type ActivityRow = {
  id: string;
  orderId: string;
  orderNumber: string;
  eventType: string;
  message: string;
  actorName: string | null;
  createdAt: string;
};

const EVENT_LABEL: Record<string, string> = {
  created: "created",
  checkout_started: "checkout started",
  payment_succeeded: "payment succeeded",
  payment_failed: "payment failed",
  paid: "marked paid",
  fulfilled: "fulfilled",
  refund_issued: "refunded",
  cancelled: "cancelled",
  note_added: "noted",
  tracking_added: "tracking added",
};

function timeAgo(iso: string): string {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Recent order timeline events across all orders — the activity feed. */
export function ActivityFeed({ rows }: { rows: ActivityRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ol className="relative flex flex-col gap-4 border-l border-border pl-5">
            {rows.map((row) => (
              <li key={row.id} className="relative">
                <span
                  className="absolute -left-[26px] top-1 size-2.5 rounded-full border-2 border-card bg-primary"
                  aria-hidden="true"
                />
                <p className="text-sm">
                  <Link
                    href={`/orders/${row.orderNumber}`}
                    className="font-medium tabular-nums text-primary hover:underline"
                  >
                    {row.orderNumber}
                  </Link>{" "}
                  <span className="text-muted-foreground">
                    {EVENT_LABEL[row.eventType] ?? row.eventType}
                    {row.actorName ? ` by ${row.actorName}` : ""}
                  </span>
                </p>
                <p className="line-clamp-2 text-[13px] text-muted-foreground">{row.message}</p>
                <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{timeAgo(row.createdAt)}</p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
