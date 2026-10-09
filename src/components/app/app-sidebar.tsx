"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Settings,
  ShoppingBag,
  TicketPercent,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

import type { UserRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { visibleNavItems, type NavItemDef } from "./nav";

/** Icon per nav href — the labels/hrefs/roles live in nav.ts. */
const NAV_ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/orders": ShoppingBag,
  "/products": Package,
  "/inventory": Warehouse,
  "/customers": Users,
  "/discounts": TicketPercent,
  "/settings": Settings,
};

/** Live counts shown as nav badges: unfulfilled orders + low-stock variants. */
export interface NavBadges {
  orders: number;
  inventory: number;
}

function badgeFor(href: string, badges: NavBadges | null): number | null {
  if (!badges) return null;
  if (href === "/orders") return badges.orders;
  if (href === "/inventory") return badges.inventory;
  return null;
}

/** Stockroom brand mark: tape-amber box glyph + uppercase Archivo wordmark. */
export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid size-7 shrink-0 place-items-center rounded-[2px] bg-sidebar-primary">
        <Package className="size-4 text-white" strokeWidth={2.25} />
      </span>
      {!compact && (
        <span className="font-display text-[13px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground">
          Stockroom
        </span>
      )}
    </span>
  );
}

function SidebarNav({
  items,
  badges,
  rail,
  onNavigate,
}: {
  items: NavItemDef[];
  badges: NavBadges | null;
  rail?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="flex flex-col gap-1 px-3">
      {items.map((item) => {
        const Icon = NAV_ICONS[item.href] ?? LayoutDashboard;
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const badge = badgeFor(item.href, badges);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            title={rail ? item.label : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
              rail && "justify-center px-0",
              active
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-[inset_3px_0_0_var(--sidebar-primary)]"
                : "text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground",
            )}
          >
            <Icon className="size-[18px] shrink-0 text-sidebar-primary" strokeWidth={1.75} />
            {!rail && <span className="truncate">{item.label}</span>}
            {!rail && badge != null && badge > 0 && (
              <span className="tnum ml-auto rounded-full bg-white/10 px-2 py-0.5 font-mono text-[11px] font-medium text-sidebar-primary">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
            {rail && badge != null && badge > 0 && (
              <span
                aria-hidden
                className="absolute ml-5 mt-[-18px] size-2 rounded-full bg-sidebar-primary"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBody({
  role,
  badges,
  rail,
  displayName,
  email,
  onNavigate,
}: {
  role: UserRole;
  badges: NavBadges | null;
  rail?: boolean;
  displayName: string | null;
  email: string | undefined;
  onNavigate?: () => void;
}) {
  const items = visibleNavItems(role);
  const initials = (displayName || email || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="flex h-full flex-col gap-5 py-5">
      <div className={cn("px-4", rail && "flex justify-center px-0")}>
        <BrandMark compact={rail} />
      </div>
      <div className="flex-1 overflow-y-auto">
        <SidebarNav items={items} badges={badges} rail={rail} onNavigate={onNavigate} />
      </div>
      <div className={cn("flex items-center gap-2.5 border-t border-white/10 px-4 pt-4", rail && "justify-center px-0")}>
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sidebar-accent font-display text-[11px] font-semibold text-sidebar-foreground">
          {initials}
        </span>
        {!rail && (
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-sidebar-foreground">
              {displayName || email || "Staff"}
            </span>
            <span className="block text-[11px] capitalize text-sidebar-muted">{role}</span>
          </span>
        )}
      </div>
    </div>
  );
}

export interface SidebarProps {
  role: UserRole;
  badges: NavBadges | null;
  displayName: string | null;
  email: string | undefined;
}

/**
 * Desktop sidebar: dark warm back-room rail. Icon-only at lg, full 240px at xl
 * (Flagship UI Designs §2.2). Live count badges on Orders (unfulfilled) and
 * Inventory (low-stock) bump via the layout's server-fetched counts.
 */
export function AppSidebar({ role, badges, displayName, email }: SidebarProps) {
  return (
    <>
      {/* lg: icon rail */}
      <aside className="sticky top-0 hidden h-svh w-16 shrink-0 bg-sidebar text-sidebar-foreground lg:block xl:hidden">
        <SidebarBody role={role} badges={badges} rail displayName={displayName} email={email} />
      </aside>
      {/* xl: full 240px */}
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 bg-sidebar text-sidebar-foreground xl:block">
        <SidebarBody role={role} badges={badges} displayName={displayName} email={email} />
      </aside>
    </>
  );
}

/** Mobile sidebar: same nav inside a slide-over drawer. */
export function AppSidebarMobile({
  role,
  badges,
  displayName,
  email,
  open,
  onOpenChange,
}: SidebarProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-72 border-0 bg-sidebar p-0 text-sidebar-foreground">
        <SheetHeader className="sr-only">
          <SheetTitle>Stockroom navigation</SheetTitle>
        </SheetHeader>
        <SidebarBody
          role={role}
          badges={badges}
          displayName={displayName}
          email={email}
          onNavigate={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
