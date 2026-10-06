import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

import { DeltaBadge, Sparkline } from "./sparkline";

export function KpiCard({
  label,
  value,
  deltaPercent,
  sparkValues,
  sparkId,
  hint,
  link,
  linkLabel,
}: {
  label: string;
  value: string;
  deltaPercent: number | null;
  sparkValues: number[];
  sparkId: string;
  hint?: string;
  link?: string;
  linkLabel?: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <DeltaBadge percent={deltaPercent} />
        </div>
        <div className="flex items-end justify-between gap-2">
          <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
          <Sparkline values={sparkValues} id={sparkId} />
        </div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        {link && linkLabel && (
          <Link
            href={link}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {linkLabel} <ArrowUpRight className="size-3.5" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
