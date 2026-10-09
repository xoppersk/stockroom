import { Skeleton } from "@/components/ui/skeleton";

/** Dashboard loading state (Flagship UI Designs §2.3): ledger + chart + table shimmer. */
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6" aria-label="Loading dashboard">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-2 h-4 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="border-t-2 border-border pt-1">
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="mt-1 h-14 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
