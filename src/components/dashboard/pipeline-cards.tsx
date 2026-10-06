import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type PipelineStage = {
  status: string;
  label: string;
  count: number;
  tone: "warning" | "success" | "info" | "neutral" | "destructive";
};

const TONE_DOT: Record<PipelineStage["tone"], string> = {
  warning: "bg-[#B45309]",
  success: "bg-[#15803D]",
  info: "bg-[#1D4ED8]",
  neutral: "bg-slate-400",
  destructive: "bg-[#DC2626]",
};

/** Order pipeline cards — each deep-links into the filtered orders list. */
export function PipelineCards({ stages }: { stages: PipelineStage[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Order pipeline</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {stages.map((stage) => (
          <Link
            key={stage.status}
            href={stage.status === "all" ? "/orders" : `/orders?status=${stage.status}`}
            className="flex min-h-11 flex-col gap-1 rounded-lg border bg-background p-3 transition-colors hover:border-primary/50"
          >
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span className={`size-2 rounded-full ${TONE_DOT[stage.tone]}`} aria-hidden="true" />
              {stage.label}
            </span>
            <span className="text-xl font-semibold tabular-nums">{stage.count}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
