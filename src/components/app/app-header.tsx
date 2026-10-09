"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Menu, Search } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

import { NotificationsBell } from "./notifications-bell";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

/** Page title + breadcrumb per route (Flagship UI Designs §2.2). */
function crumbsFor(pathname: string): { title: string; trail: { label: string; href?: string }[] } {
  const seg = pathname.split("/").filter(Boolean);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  if (seg[0] === "dashboard") return { title: "Dashboard", trail: [{ label: "Dashboard" }] };
  if (seg[0] === "orders") {
    if (seg[1] === "new") return { title: "New order", trail: [{ label: "Orders", href: "/orders" }, { label: "New" }] };
    if (seg[1]) return { title: seg[1], trail: [{ label: "Orders", href: "/orders" }, { label: seg[1] }] };
    return { title: "Orders", trail: [{ label: "Orders" }] };
  }
  if (seg[0] === "products") {
    if (seg[1] === "new") return { title: "New product", trail: [{ label: "Products", href: "/products" }, { label: "New" }] };
    if (seg[1]) return { title: "Product", trail: [{ label: "Products", href: "/products" }, { label: "Edit" }] };
    return { title: "Products", trail: [{ label: "Products" }] };
  }
  if (seg[0] === "inventory") return { title: "Inventory", trail: [{ label: "Inventory" }] };
  if (seg[0] === "customers") {
    if (seg[1] === "new") return { title: "New customer", trail: [{ label: "Customers", href: "/customers" }, { label: "New" }] };
    if (seg[1]) return { title: "Customer", trail: [{ label: "Customers", href: "/customers" }, { label: "Detail" }] };
    return { title: "Customers", trail: [{ label: "Customers" }] };
  }
  if (seg[0] === "discounts") {
    if (seg[1] === "new") return { title: "New discount", trail: [{ label: "Discounts", href: "/discounts" }, { label: "New" }] };
    return { title: "Discounts", trail: [{ label: "Discounts" }] };
  }
  if (seg[0] === "settings") return { title: "Settings", trail: [{ label: "Settings" }] };
  if (seg[0] === "app" && seg[1] === "account") return { title: "Account", trail: [{ label: "Account" }] };
  return { title: cap(seg[0] ?? ""), trail: [{ label: cap(seg[0] ?? "") }] };
}

/**
 * App header: mobile nav trigger, page title + breadcrumb, ⌘K global search,
 * notifications bell, theme toggle, and the user-menu slot.
 */
export function AppHeader({
  email,
  displayName,
  userMenu,
  onMenuClick,
  onPaletteOpen,
}: {
  email: string | undefined;
  displayName: string | null;
  userMenu?: ReactNode;
  onMenuClick: () => void;
  onPaletteOpen: () => void;
}) {
  const pathname = usePathname();
  const { title, trail } = crumbsFor(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick} aria-label="Open navigation">
        <Menu className="size-[18px]" />
      </Button>

      <div className="hidden min-w-0 items-center gap-2 md:flex">
        <h1 className="truncate font-display text-[15px] font-semibold tracking-tight">{title}</h1>
        <nav aria-label="Breadcrumb" className="hidden items-center gap-1 text-xs text-muted-foreground xl:flex">
          {trail.map((crumb, i) => (
            <span key={crumb.label} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3" />}
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-foreground hover:underline">
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current="page">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      </div>

      <div className="flex-1" />

      <Button
        variant="outline"
        onClick={onPaletteOpen}
        className="hidden w-64 justify-start gap-2 text-muted-foreground sm:flex"
        aria-label="Search or command (Command K)"
      >
        <Search className="size-4" />
        <span className="text-sm">Search or command…</span>
        <kbd className="ml-auto rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">⌘K</kbd>
      </Button>
      <Button variant="ghost" size="icon" className="sm:hidden" onClick={onPaletteOpen} aria-label="Search">
        <Search className="size-[18px]" />
      </Button>

      <NotificationsBell />
      <ThemeToggle />
      {userMenu ?? <UserMenu email={email} displayName={displayName} />}
    </header>
  );
}
