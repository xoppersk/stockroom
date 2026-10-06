"use client";

/**
 * Product list toolbar: search, category/status filters, list/grid toggle.
 * Filter changes rewrite the URL search params so every view is deep-linkable;
 * the server component re-queries on each navigation.
 */
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, List, Plus, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type ProductView = "list" | "grid";

interface ProductToolbarProps {
  categories: { id: string; name: string }[];
  q: string;
  category: string;
  status: string;
  view: ProductView;
  isAdmin: boolean;
  hasActiveFilters: boolean;
}

export function ProductToolbar({
  categories,
  q,
  category,
  status,
  view,
  isAdmin,
  hasActiveFilters,
}: ProductToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(q);

  function pushParams(mutator: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutator(params);
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    pushParams((params) => {
      if (search.trim()) params.set("q", search.trim());
      else params.delete("q");
    });
  }

  function setFilter(key: "category" | "status", value: string) {
    pushParams((params) => {
      if (value && value !== "all") params.set(key, value);
      else params.delete(key);
    });
  }

  function setView(next: ProductView) {
    pushParams((params) => {
      if (next === "grid") params.set("view", "grid");
      else params.delete("view");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <form onSubmit={submitSearch} className="relative flex-1" role="search">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title or SKU…"
            aria-label="Search products by title or SKU"
            className="pr-16 pl-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                pushParams((params) => params.delete("q"));
              }}
              className="absolute top-1/2 right-10 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="absolute top-1/2 right-1 -translate-y-1/2"
          >
            Go
          </Button>
        </form>

        <div className="flex items-center gap-2">
          <Select value={category || "all"} onValueChange={(v) => setFilter("category", v)}>
            <SelectTrigger aria-label="Filter by category" className="w-[150px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={status || "all"} onValueChange={(v) => setFilter("status", v)}>
            <SelectTrigger aria-label="Filter by status" className="w-[130px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex rounded-md border" role="group" aria-label="View">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setView("list")}
              aria-label="List view"
              aria-pressed={view === "list"}
              className={cn("rounded-r-none", view === "list" && "bg-muted")}
            >
              <List className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setView("grid")}
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              className={cn("rounded-l-none", view === "grid" && "bg-muted")}
            >
              <LayoutGrid className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/products">
                <X className="size-3.5" />
                Clear filters
              </Link>
            </Button>
          )}
        </div>
        {isAdmin && (
          <Button asChild>
            <Link href="/products/new">
              <Plus className="size-4" />
              New product
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
