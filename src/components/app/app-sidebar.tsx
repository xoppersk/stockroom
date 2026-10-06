"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShoppingBag,
  TicketPercent,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

import type { UserRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

function SidebarNav({
  items,
  collapsed,
  onNavigate,
}: {
  items: NavItemDef[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-2">
      {items.map((item) => {
        const Icon = NAV_ICONS[item.href] ?? LayoutDashboard;
        const active = pathname === item.href;
        return (
          <Button
            key={item.href}
            variant={active ? "secondary" : "ghost"}
            asChild
            className={cn("justify-start", collapsed && "justify-center px-0")}
            title={collapsed ? item.label : undefined}
          >
            <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined}>
              <Icon className="size-4 shrink-0" />
              {collapsed ? null : <span className="truncate">{item.label}</span>}
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}

/** Desktop sidebar (md+). Collapses to an icon rail. */
export function AppSidebar({
  role,
  collapsed,
  onToggleCollapse,
}: {
  role: UserRole;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const items = visibleNavItems(role);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 flex-col border-r bg-sidebar md:flex",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className={cn("flex h-14 items-center border-b px-4", collapsed && "justify-center px-0")}>
        {collapsed ? (
          <span className="text-sm font-bold">S</span>
        ) : (
          <span className="truncate font-semibold tracking-tight">Stockroom</span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        <SidebarNav items={items} collapsed={collapsed} />
      </div>
      <div className="border-t p-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="w-full"
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </Button>
      </div>
    </aside>
  );
}

/** Mobile sidebar: same nav inside a slide-over drawer. */
export function AppSidebarMobile({
  role,
  open,
  onOpenChange,
}: {
  role: UserRole;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b p-4 text-left">
          <SheetTitle>Stockroom</SheetTitle>
        </SheetHeader>
        <SidebarNav items={visibleNavItems(role)} onNavigate={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}
