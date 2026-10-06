"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const REASONS = [
  { value: "", label: "All reasons" },
  { value: "sale", label: "Sale" },
  { value: "restock_received", label: "Restock received" },
  { value: "damaged", label: "Damaged / lost" },
  { value: "recount", label: "Recount correction" },
  { value: "return", label: "Customer return" },
  { value: "cancelled_order", label: "Cancelled order" },
  { value: "manual", label: "Manual correction" },
];

/**
 * Filter bar for the inventory page: variant search + low-stock toggle for
 * the stock table, and variant / reason / actor / date filters for the
 * history log. Every filter is a URL param so views are deep-linkable.
 */
export function InventoryFilters({
  actors,
}: {
  actors: { id: string; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  function set(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    router.push(query ? `/inventory?${query}` : "/inventory");
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    set({
      q: String(data.get("q") ?? "").trim() || undefined,
      hFrom: String(data.get("hFrom") ?? "") || undefined,
      hTo: String(data.get("hTo") ?? "") || undefined,
    });
  }

  const alertLow = params.get("alert") === "low";
  const hasFilters = [...params.keys()].length > 0;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-end">
        <div className="flex-1">
          <Label htmlFor="inv-search" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Search variants
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="inv-search"
              name="q"
              key={params.get("q") ?? ""}
              defaultValue={params.get("q") ?? ""}
              placeholder="SKU, variant, or product…"
              className="pl-9"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => set({ alert: alertLow ? undefined : "low" })}
          aria-pressed={alertLow}
          className={cn(
            "inline-flex min-h-11 items-center justify-center rounded-full border px-3.5 text-sm font-medium transition-colors",
            alertLow
              ? "border-[#B45309] bg-[#B45309]/10 text-[#B45309]"
              : "border-border bg-card hover:border-primary/50",
          )}
        >
          Low stock only
        </button>
        <div className="flex gap-2">
          <Button type="submit" className="min-h-11">Apply</Button>
          {hasFilters && (
            <Button type="button" variant="outline" className="min-h-11" onClick={() => router.push("/inventory")}>
              <X className="size-4" /> Clear
            </Button>
          )}
        </div>
      </div>

      <details className="rounded-lg border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
          History filters
          {(params.get("hReason") ?? params.get("hActor") ?? params.get("hFrom") ?? params.get("hTo")) && (
            <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">active</span>
          )}
        </summary>
        <div className="grid gap-3 border-t p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="hReason" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Reason
            </Label>
            <Select
              value={params.get("hReason") ?? "all"}
              onValueChange={(v) => set({ hReason: v === "all" ? undefined : v })}
            >
              <SelectTrigger id="hReason" className="min-h-11">
                <SelectValue placeholder="All reasons" />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r.value || "all"} value={r.value || "all"}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="hActor" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Actor
            </Label>
            <Select
              value={params.get("hActor") ?? "all"}
              onValueChange={(v) => set({ hActor: v === "all" ? undefined : v })}
            >
              <SelectTrigger id="hActor" className="min-h-11">
                <SelectValue placeholder="Everyone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                {actors.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="hFrom" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              From
            </Label>
            <Input id="hFrom" name="hFrom" type="date" defaultValue={params.get("hFrom") ?? ""} className="min-h-11" />
          </div>
          <div>
            <Label htmlFor="hTo" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              To
            </Label>
            <Input id="hTo" name="hTo" type="date" defaultValue={params.get("hTo") ?? ""} className="min-h-11" />
          </div>
        </div>
      </details>
    </form>
  );
}
