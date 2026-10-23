/* View mapping for the admin settings area (A-01…A-03) — pure
   translations from the real data layer's shapes into the shapes the
   settings screens render. NO fixture defaults and NO fallbacks: what
   the DB does not hold is represented as an honest empty / not-enabled
   state by the components, never as drawn sample data.

   Sources:
   - Settings identity: src/lib/config.ts constants (ruling 11).
   - Settings editable fields: store_settings via
     getConsoleStoreSettings() (tax_rate / shipping_flat /
     free_shipping_threshold — the only DB-backed settings).
   - Team: profiles + user_roles via listConsoleTeam() (types
     TeamMember), display roles per ruling 7.
   - Permission matrix: words derived from the REAL DB capability
     rules (RLS policies + SECURITY DEFINER RPC role checks), not
     fixture data.
   - Audit: audit_log via listConsoleAudit() (types AuditEntry). */

import { SHOP_ADDRESS, SHOP_EMAIL, SHOP_NAME } from "@/lib/config";
import type {
  AuditEntry as DbAuditEntry,
  AuditList,
  TeamMember as DbTeamMember,
} from "@/lib/types";
import type { StampTone } from "@/components/sr/Stamp";

/* ---------------- Settings (A-02) ---------------- */

export type AdminSettings = {
  /* Editable-real field values (the SAVED state) — the only fields the
     dirty machinery tracks (ruling 11). Keys are settings-dirty ids.
     Values are display strings: tax as a percent ("6"), money as
     dollars ("12.50"); freeShipThreshold "" means no threshold. */
  fields: Record<string, string>;
  /* Read-only store identity from config.ts constants. */
  storeName: string;
  address: string;
  replyEmail: string;
  /* Alerts rows: the real notifications behaviour (00005/00008/00011 —
     every one of these events writes a broadcast in-app notification
     to all staff; there is no per-person alert routing in the DB). */
  alertRows: { when: string; tell: string; how: string }[];
};

export const ALERT_ROWS: AdminSettings["alertRows"] = [
  { when: "A new order is placed", tell: "All staff", how: "In-app notification" },
  { when: "A variant drops below its low-stock level", tell: "All staff", how: "In-app notification" },
  { when: "A refund is issued", tell: "All staff", how: "In-app notification" },
  { when: "An order is cancelled", tell: "All staff", how: "In-app notification" },
];

export function buildSettingsView(s: {
  taxRatePct: number;
  shippingFlatCents: number;
  freeShipThresholdCents: number | null;
}): AdminSettings {
  return {
    fields: {
      taxRatePct: String(s.taxRatePct),
      shippingFlat: (s.shippingFlatCents / 100).toFixed(2),
      freeShipThreshold:
        s.freeShipThresholdCents === null
          ? ""
          : (s.freeShipThresholdCents / 100).toFixed(2),
    },
    storeName: SHOP_NAME,
    address: SHOP_ADDRESS,
    replyEmail: SHOP_EMAIL,
    alertRows: ALERT_ROWS,
  };
}

/* ---------------- Team (A-01) ---------------- */

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  initials: string;
  avatarTone: "a" | "b" | "c";
  role: string;
  /** Selectable roles; null = fixed role shown as a Stamp (the signed-in
   *  member's own row — self-demotion would lock the console). */
  roleOptions: string[] | null;
  lastIn: string;
  you?: boolean;
};

export type TeamInvite = {
  id: string;
  email: string;
  role: string;
  note: string;
  lastIn: string;
};

/* Display roles that exist in the DB (ruling 7): admin → Owner,
   warehouse → Fulfillment, support → Customer service. Manager and
   Bookkeeper do not exist and are never offered. */
export const DISPLAY_ROLES = ["Owner", "Fulfillment", "Customer service"];

export function dbRoleOfDisplay(
  display: string,
): "admin" | "warehouse" | "support" {
  if (display === "Owner") return "admin";
  if (display === "Customer service") return "support";
  return "warehouse";
}

const AVATAR_TONES: TeamMember["avatarTone"][] = ["a", "b", "c", "b"];

export function buildTeamView(members: DbTeamMember[]): TeamMember[] {
  return members.map((m, i) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    initials: m.initials,
    avatarTone: AVATAR_TONES[i % AVATAR_TONES.length] ?? "a",
    role: m.role,
    roleOptions: m.isYou ? null : [...DISPLAY_ROLES],
    lastIn: m.lastInLabel,
    you: m.isYou,
  }));
}

/* ---------------- Permission matrix (A-01) ---------------- */

/* Columns are the two non-owner roles (the panel caption covers the
   Owner: admin can do everything). Every word comes from the DB:
   - orders fulfill update: admin/warehouse; staff read for support.
   - inventory adjust_inventory RPC: admin/warehouse; staff read.
   - refunds issue_order_refund RPC: admin/support.
   - catalog (products/variants) writes: admin only.
   - discounts: admin-write; support may insert one-time apology codes.
   - customers writes: admin/support; staff read for warehouse.
   - store_settings writes + user_roles writes + audit_log read: admin. */
export const REAL_PERMISSION_MATRIX: {
  roles: string[];
  rows: { capability: string; values: string[] }[];
} = {
  roles: ["Fulfillment", "Customer service"],
  rows: [
    { capability: "Pick, pack and ship orders", values: ["Yes", "View"] },
    { capability: "Adjust stock and receive deliveries", values: ["Yes", "View"] },
    { capability: "Refund orders", values: ["No", "Yes"] },
    { capability: "Edit products and prices", values: ["No", "No"] },
    { capability: "Create discount codes", values: ["No", "Apology codes only"] },
    { capability: "Edit customers", values: ["View", "Yes"] },
    { capability: "Change settings and team", values: ["No", "No"] },
    { capability: "See audit history", values: ["No", "No"] },
  ],
};

/* ---------------- Audit history (A-03) ---------------- */

export type AuditSegment =
  | { t: "text"; text: string }
  | { t: "mono"; text: string }
  | { t: "link"; text: string; href: string }
  | { t: "change"; from: string; to: string }
  | { t: "italic"; text: string };

export type AuditEntry = {
  id: string;
  dayLabel: string;
  dateISO: string;
  time: string;
  who: string;
  system?: boolean;
  segments: AuditSegment[];
  /** Plain-text version of "what changed" — search + CSV export. */
  plain: string;
  kindLabel: string;
  kindTone: StampTone;
  /** Filter bucket: one of the Kind select's options. */
  filterKind: "Stock" | "Money" | "Prices and cost" | "Access";
  money?: string;
  /** Signed cents for money filtering; null = no money movement. */
  moneyCents: number | null;
  moneyKind: "out" | "in" | "held" | null;
};

const KIND_TONES: Record<string, StampTone> = {
  stock: "slate",
  money: "problem",
  price: "ink",
  access: "ink",
};

const KIND_FILTER: Record<string, AuditEntry["filterKind"]> = {
  stock: "Stock",
  money: "Money",
  price: "Prices and cost",
  access: "Access",
};

const KIND_LABELS: Record<string, string> = {
  stock: "Stock",
  money: "Money",
  price: "Price",
  access: "Access",
};

/* Codes that are always set in mono in audit text (HANDOVER §5.4):
   order ids, PO numbers, SKUs, emails, discount codes. */
const CODE_RE =
  /(ORD-\d+|PO-\d+|[A-Z]{2,3}-[A-Z0-9]{2,}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|[A-Z]{4,}\d{2,})/g;

function segmentsFromText(
  text: string,
  oldValue: string | null,
  newValue: string | null,
): AuditSegment[] {
  const segments: AuditSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(CODE_RE)) {
    const idx = match.index ?? 0;
    if (idx > last) segments.push({ t: "text", text: text.slice(last, idx) });
    segments.push({ t: "mono", text: match[0] });
    last = idx + match[0].length;
  }
  if (last < text.length) segments.push({ t: "text", text: text.slice(last) });
  if (oldValue && newValue) {
    segments.push({ t: "text", text: " " });
    segments.push({ t: "change", from: oldValue, to: newValue });
  }
  return segments.length > 0 ? segments : [{ t: "text", text }];
}

function moneyFromCents(cents: number): string {
  const sign = cents < 0 ? "−" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
}

function mapAuditEntry(e: DbAuditEntry): AuditEntry {
  const kindLabel = e.stampLabel ?? KIND_LABELS[e.kind] ?? "Stock";
  let money: string | undefined;
  let moneyKind: AuditEntry["moneyKind"] = null;
  if (e.moneyCents !== null && e.moneyCents < 0) {
    money = moneyFromCents(e.moneyCents);
    moneyKind = "out";
  } else if (e.moneyCents !== null && e.moneyCents > 0) {
    money = /held/i.test(e.text)
      ? `${moneyFromCents(e.moneyCents)} held`
      : moneyFromCents(e.moneyCents);
    moneyKind = /held/i.test(e.text) ? "held" : "in";
  }
  return {
    id: e.id,
    dayLabel: e.dayGroup,
    dateISO: e.dateISO,
    time: e.timeLabel,
    who: e.actorName,
    system: e.actorName === "System",
    segments: segmentsFromText(e.text, e.oldValue, e.newValue),
    plain: e.text,
    kindLabel,
    kindTone: KIND_TONES[e.kind] ?? "slate",
    filterKind: KIND_FILTER[e.kind] ?? "Stock",
    money,
    moneyCents: e.moneyCents,
    moneyKind,
  };
}

/** Translate the data layer's AuditList to the page shape. An empty
 *  list stays empty — non-admin staff see the RLS truth (audit_log is
 *  admin-read) and the client renders its honest restricted state. */
export function buildAuditView(list: AuditList): {
  entries: AuditEntry[];
  total: number;
  shown: number;
} {
  return {
    entries: list.entries.map(mapAuditEntry),
    total: list.totalCount,
    shown: list.shownCount > 0 ? list.shownCount : list.entries.length,
  };
}
