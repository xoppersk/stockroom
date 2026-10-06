"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

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

export type SortKey = "newest" | "price_asc" | "price_desc";

interface FiltersProps {
  categories: { slug: string; name: string }[];
  initial: { q: string; category: string; min: string; max: string; sort: SortKey };
}

/** Listing filters — search (debounced), category pills, price range, sort. */
export function ShopFilters({ categories, initial }: FiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(initial.q);

  function push(params: URLSearchParams) {
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    push(params);
  }

  // Debounced search — updates the URL as the shopper types.
  useEffect(() => {
    if (q === initial.q) return;
    const t = setTimeout(() => setParam("q", q.trim()), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const activeCategory = initial.category;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label htmlFor="shop-search">Search</Label>
          <Input
            id="shop-search"
            type="search"
            placeholder="Search products…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="mt-1"
          />
        </div>
        <div className="flex gap-3">
          <div>
            <Label htmlFor="price-min">Min price</Label>
            <Input
              id="price-min"
              type="number"
              min={0}
              inputMode="decimal"
              placeholder="$0"
              defaultValue={initial.min}
              key={`min-${initial.min}`}
              onBlur={(e) => setParam("min", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="mt-1 w-24 tabular-nums"
            />
          </div>
          <div>
            <Label htmlFor="price-max">Max price</Label>
            <Input
              id="price-max"
              type="number"
              min={0}
              inputMode="decimal"
              placeholder="Any"
              defaultValue={initial.max}
              key={`max-${initial.max}`}
              onBlur={(e) => setParam("max", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="mt-1 w-24 tabular-nums"
            />
          </div>
          <div>
            <Label htmlFor="sort">Sort</Label>
            <Select
              defaultValue={initial.sort}
              onValueChange={(v) => setParam("sort", v)}
            >
              <SelectTrigger id="sort" className="mt-1 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="price_asc">Price: low to high</SelectItem>
                <SelectItem value="price_desc">Price: high to low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
        <Button
          variant={activeCategory === "" ? "default" : "outline"}
          size="sm"
          onClick={() => setParam("category", "")}
        >
          All
        </Button>
        {categories.map((c) => (
          <Button
            key={c.slug}
            variant={activeCategory === c.slug ? "default" : "outline"}
            size="sm"
            onClick={() => setParam("category", c.slug)}
          >
            {c.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
