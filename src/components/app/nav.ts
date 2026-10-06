import type { UserRole } from "@/lib/auth/roles";

/**
 * Sidebar navigation — the single source of truth for the app nav.
 *
 * Every entry a later phase will implement is declared here up front, so
 * builders only add pages + actions. `roles` gates visibility: warehouse and
 * support staff never see Settings (DATABASE-SCHEMA.md §3, "Role-gated nav").
 *
 * Icons live in `app-sidebar.tsx` (client component); this module stays
 * icon-free so it can be unit-tested in node.
 */
export interface NavItemDef {
  label: string;
  href: string;
  /** Roles allowed to see this entry. */
  roles: readonly UserRole[];
  /** Short description shown on the phase placeholder page. */
  blurb: string;
  /** Which implementation-plan phase builds this section. */
  phase: string;
}

const ALL_STAFF: readonly UserRole[] = ["admin", "warehouse", "support"];

export const NAV_ITEMS: readonly NavItemDef[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    roles: ALL_STAFF,
    blurb: "The morning check — KPIs, revenue, order pipeline, low stock.",
    phase: "Phase 7",
  },
  {
    label: "Orders",
    href: "/orders",
    roles: ALL_STAFF,
    blurb: "The workhorse — filter, fulfill, refund, and track every order.",
    phase: "Phase 4",
  },
  {
    label: "Products",
    href: "/products",
    roles: ALL_STAFF,
    blurb: "Catalog, variants, and media for everything Juniper Supply Co. sells.",
    phase: "Phase 3",
  },
  {
    label: "Inventory",
    href: "/inventory",
    roles: ALL_STAFF,
    blurb: "Variant-level stock, adjustments, and the low-stock panel.",
    phase: "Phase 5",
  },
  {
    label: "Customers",
    href: "/customers",
    roles: ALL_STAFF,
    blurb: "Customer profiles, order history, and notes.",
    phase: "Phase 6",
  },
  {
    label: "Discounts",
    href: "/discounts",
    roles: ALL_STAFF,
    blurb: "Discount codes, validation, and redemption counts.",
    phase: "Phase 6",
  },
  {
    label: "Settings",
    href: "/settings",
    roles: ["admin"],
    blurb: "Staff invites and store settings. Admins only.",
    phase: "Phase 1",
  },
];

/** Nav entries visible to `role`. A role-less user sees nothing. */
export function visibleNavItems(role: UserRole | null): NavItemDef[] {
  if (!role) return [];
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
