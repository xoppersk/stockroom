"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Package, ShoppingBag, Users, type LucideIcon } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export interface PaletteCommand {
  /** Stable id for React keys. */
  id: string;
  label: string;
  /** Extra search terms, e.g. "settings preferences". */
  keywords?: string;
  hint?: string;
  icon?: LucideIcon;
  run: () => void;
}

/** Event name the header button dispatches to open the palette. */
export const OPEN_PALETTE_EVENT = "app:open-palette";

interface EntityHit {
  id: string;
  label: string;
  detail: string;
  href: string;
  icon: LucideIcon;
}

/**
 * cmdk command palette (Flagship UI Designs §2.2). Opens on ⌘K / Ctrl+K or the
 * OPEN_PALETTE_EVENT. Beyond static commands it jumps to orders, products, and
 * customers by id, name, or SKU.
 */
export function CommandPalette({ commands }: { commands: PaletteCommand[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<EntityHit[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpenEvent);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  /** Debounced entity search across orders / products / customers. */
  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = value.trim();
    if (term.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      void (async () => {
        const supabase = createClient();
        const like = `%${term}%`;
        // Customers first — order search also matches on customer name/email.
        const { data: customerMatches } = await supabase
          .from("customers")
          .select("id, first_name, last_name, email")
          .or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`)
          .order("updated_at", { ascending: false })
          .limit(5);
        const customerIds = (customerMatches ?? []).map((c) => c.id);
        const [orders, products, variants] = await Promise.all([
          supabase
            .from("orders")
            .select("id, order_number, customer_id, customers(first_name, last_name)")
            .or(
              `order_number.ilike.${like}${customerIds.length > 0 ? `,customer_id.in.(${customerIds.join(",")})` : ""}`,
            )
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("products")
            .select("id, title")
            .ilike("title", like)
            .order("updated_at", { ascending: false })
            .limit(5),
          supabase
            .from("product_variants")
            .select("sku, product_id, products(id, title)")
            .ilike("sku", like)
            .limit(5),
        ]);
        const customerName = (o: { customers: { first_name: string; last_name: string } | null }) =>
          o.customers ? `${o.customers.first_name} ${o.customers.last_name}`.trim() : "";
        const next: EntityHit[] = [
          ...(orders.data ?? []).map((o) => ({
            id: `order-${o.id}`,
            label: o.order_number,
            detail: customerName(o) || "Order",
            href: `/orders/${o.id}`,
            icon: ShoppingBag,
          })),
          ...(products.data ?? []).map((p) => ({
            id: `product-${p.id}`,
            label: p.title,
            detail: "Product",
            href: `/products/${p.id}`,
            icon: Package,
          })),
          ...(variants.data ?? []).flatMap((v) => {
            const p = Array.isArray(v.products) ? v.products[0] : v.products;
            if (!p?.id) return [];
            return [
              {
                id: `sku-${v.sku}`,
                label: v.sku,
                detail: p.title ?? "Variant",
                href: `/products/${p.id}`,
                icon: Package,
              },
            ];
          }),
          ...(customerMatches ?? []).map((c) => ({
            id: `customer-${c.id}`,
            label: `${c.first_name} ${c.last_name}`.trim(),
            detail: c.email,
            href: `/customers/${c.id}`,
            icon: Users,
          })),
        ];
        setHits(next);
        setSearching(false);
      })();
    }, 250);
  }

  function go(href: string) {
    setOpen(false);
    setQuery("");
    setHits([]);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Type a command or search…"
        value={query}
        onValueChange={handleQueryChange}
      />
      <CommandList>
        <CommandEmpty>
          {searching ? "Searching…" : "No matches — try an order number, name, or SKU."}
        </CommandEmpty>
        {hits.length > 0 && (
          <CommandGroup heading="Jump to">
            {hits.map((hit) => (
              <CommandItem
                key={hit.id}
                value={`${hit.label} ${hit.detail}`}
                onSelect={() => go(hit.href)}
                className="cursor-pointer"
              >
                <hit.icon className="size-4 text-muted-foreground" />
                <span className="font-mono text-[13px]">{hit.label}</span>
                <span className="truncate text-xs text-muted-foreground">{hit.detail}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Commands">
          {commands.map((command) => (
            <CommandItem
              key={command.id}
              value={`${command.label} ${command.keywords ?? ""}`.trim()}
              onSelect={() => {
                setOpen(false);
                command.run();
              }}
              className="cursor-pointer"
            >
              {command.icon ? <command.icon className="size-4 text-muted-foreground" /> : null}
              <span>{command.label}</span>
              {command.hint ? (
                <kbd className="ml-auto rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                  {command.hint}
                </kbd>
              ) : null}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

/** Dispatch from anywhere (e.g. a header button) to open the palette. */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
}
