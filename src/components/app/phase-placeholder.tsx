import type { LucideIcon } from "lucide-react";

import { EmptyState } from "./empty-state";

/**
 * Standing page for sections whose build phase hasn't run yet. Every nav
 * entry has a real route from day one (so the sidebar never 404s); each
 * phase replaces its placeholder with the real screen. No mock data —
 * the page states plainly what is coming and when.
 */
export function PhasePlaceholder({
  icon,
  title,
  phase,
  description,
}: {
  icon: LucideIcon;
  title: string;
  phase: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <EmptyState
        icon={icon}
        title={`${title} lands in ${phase}`}
        description="This section is on the build plan. The database tables, RLS policies, and server functions it needs are already in place."
      />
    </div>
  );
}
