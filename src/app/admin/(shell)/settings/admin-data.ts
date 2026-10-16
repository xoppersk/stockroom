/* Fixture defaults + normalizers for the admin settings area (A-01…A-03).

   Pages read through @/lib/api (getSettings / getTeam /
   getPermissionMatrix / listAudit). The normalizers translate the api's
   fixture shapes (lib/types.ts: ShopSettings, TeamMember, PermissionRow,
   AuditList) into the shapes the settings screens render, merging over
   screen-transcribed defaults so anything absent still renders exactly
   as drawn in screens/Settings.html, Team.html and AuditHistory.html. */

import type { StampTone } from "@/components/sr/Stamp";

/* ---------------- Settings (A-02) ---------------- */

export type AdminCarrier = {
  id: string;
  name: string;
  /** Note after the carrier name, e.g. "from $9.80" (mono) or pickup copy. */
  note?: string;
  noteMono?: boolean;
  checked: boolean;
};

export type AdminSettings = {
  /* Editable field values (the SAVED state). Keys are the dirty-field
     ids used by settings-dirty.tsx; carriers are `carrier:<name>`. */
  fields: Record<string, string>;
  /* The draft the page loads with, for fields the fixture marks as
     already changed (cut-off + default box — the drawn "2 unsaved
     changes"). Only entries that differ from `fields` are present. */
  draft: Record<string, string>;
  carriers: AdminCarrier[];
  boxOptions: string[];
  stripeAccountEnding: string;
  payoutSchedule: string;
  nextPayout: string;
  nextPayoutDate: string;
  payoutAccountEnding: string;
  taxRows: { region: string; rate: string; collecting: string; muted?: boolean }[];
  alertRows: { when: string; tell: string; how: string }[];
};

export const SETTINGS_FIELD_DEFAULTS: Record<string, string> = {
  storeName: "Larder & Loom",
  /* Settings.html draws the ZIP; data/settings.json drops it — the
     screen is pixel truth for copy, so the ZIP stays (flagged in the
     worker report for the data owner). */
  address: "2214 Fitzwater St, Philadelphia, PA 19146",
  pickupDays: "Tue – Sat",
  pickupOpen: "10:00 AM",
  pickupClose: "6:00 PM",
  replyEmail: "hello@sevynlabs.io",
  cutoff: "2:00 PM",
  defaultBox: "Medium flat · 12 × 10 × 4 in",
  slipNote:
    "Thanks for buying from a small workshop. Wash linen before first use; it softens every time.",
};

/* Checkbox states as drawn in Settings.html (the fixture's carrier list
   carries no enabled flags). */
const CARRIER_CHECKED: Record<string, boolean> = {
  "USPS Ground Advantage": true,
  "UPS Ground": true,
  "UPS 2nd Day Air": false,
  "Local pickup": true,
};

export const SETTINGS_DEFAULTS: AdminSettings = {
  fields: {
    ...SETTINGS_FIELD_DEFAULTS,
    "carrier:USPS Ground Advantage": "on",
    "carrier:UPS Ground": "on",
    "carrier:UPS 2nd Day Air": "off",
    "carrier:Local pickup": "on",
  },
  draft: {
    cutoff: "1:00 PM",
    defaultBox: "Small · 9 × 6 × 3 in",
  },
  carriers: [
    { id: "carrier:USPS Ground Advantage", name: "USPS Ground Advantage", note: "from $9.80", noteMono: true, checked: true },
    { id: "carrier:UPS Ground", name: "UPS Ground", note: "from $11.40", noteMono: true, checked: true },
    { id: "carrier:UPS 2nd Day Air", name: "UPS 2nd Day Air", checked: false },
    { id: "carrier:Local pickup", name: "Local pickup", note: "free, ready in 2 hours", checked: true },
  ],
  boxOptions: [
    "Medium flat · 12 × 10 × 4 in",
    "Small · 9 × 6 × 3 in",
    "Large · 16 × 12 × 6 in",
  ],
  stripeAccountEnding: "4X2Q",
  payoutSchedule: "Every weekday, 2-day delay.",
  nextPayout: "$2,184.60",
  nextPayoutDate: "Wed, Oct 7",
  payoutAccountEnding: "••81",
  taxRows: [
    { region: "Pennsylvania", rate: "6.00%", collecting: "Yes, registered" },
    { region: "All other states", rate: "0.00%", collecting: "Below thresholds", muted: true },
  ],
  alertRows: [
    { when: "An order is held (payment, address or stock)", tell: "Kofi, Rosa", how: "Email + dashboard" },
    { when: "A variant drops below its low-stock level", tell: "Kofi", how: "Morning digest" },
    { when: "A variant sells out on the storefront", tell: "Kofi, Sheku", how: "Email right away" },
    { when: "A refund over $100 is requested", tell: "Sheku", how: "Email right away" },
    { when: "Payout sent", tell: "Ben", how: "Weekly summary" },
  ],
};

function str(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

function moneyFromCents(cents: number): string {
  const sign = cents < 0 ? "−" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
}

/** Translate an api getSettings() result (ShopSettings) to AdminSettings. */
export function normalizeSettings(raw: unknown): AdminSettings {
  if (!raw || typeof raw !== "object") return SETTINGS_DEFAULTS;
  const r = raw as Record<string, unknown>;
  const store = (r.store ?? {}) as Record<string, unknown>;
  const ful = (r.fulfillment ?? {}) as Record<string, unknown>;
  const pay = (r.payments ?? {}) as Record<string, unknown>;

  const fields = { ...SETTINGS_DEFAULTS.fields };
  const pick = (id: string, v: string | undefined) => {
    if (v !== undefined) fields[id] = v;
  };
  pick("storeName", str(store, "name", "storeName"));
  const apiAddress = str(store, "address", "workshopAddress");
  /* Screen draws the ZIP the fixture omits — keep the screen copy when
     the fixture address is the same street address without it. */
  pick(
    "address",
    apiAddress && apiAddress.startsWith("2214 Fitzwater St")
      ? SETTINGS_FIELD_DEFAULTS.address
      : apiAddress,
  );
  pick("pickupDays", str(store, "pickupDays"));
  pick("pickupOpen", str(store, "pickupOpens", "pickupOpen"));
  pick("pickupClose", str(store, "pickupCloses", "pickupClose"));
  pick("replyEmail", str(store, "replyEmail"));
  pick("cutoff", str(ful, "cutoffSavedLabel", "cutoff"));
  pick("defaultBox", str(ful, "defaultBoxSaved", "defaultBox"));
  pick("slipNote", str(ful, "slipNote", "packingSlipNote"));

  /* Draft (already-changed) fields, per the fixture's changed flags. */
  const draft: Record<string, string> = {};
  const cutoffDraft = str(ful, "cutoffDraftLabel");
  if (cutoffDraft && (ful.cutoffChanged === true || cutoffDraft !== fields.cutoff)) {
    draft.cutoff = cutoffDraft;
  }
  const boxDraft = str(ful, "defaultBoxDraft");
  if (boxDraft && (ful.defaultBoxChanged === true || boxDraft !== fields.defaultBox)) {
    draft.defaultBox = boxDraft;
  }

  /* Carriers: fixture list (name + fromCents + note); checked states are
     the screen's, as the fixture carries no enabled flags. */
  let carriers = SETTINGS_DEFAULTS.carriers;
  if (Array.isArray(ful.carriers) && ful.carriers.length > 0) {
    carriers = (ful.carriers as Record<string, unknown>[]).map((c) => {
      const name = str(c, "name") ?? "";
      const fromCents = typeof c.fromCents === "number" ? c.fromCents : null;
      const noteText = str(c, "note");
      const checked = CARRIER_CHECKED[name] ?? true;
      fields[`carrier:${name}`] = checked ? "on" : "off";
      return {
        id: `carrier:${name}`,
        name,
        note: noteText ?? (fromCents ? `from ${moneyFromCents(fromCents)}` : undefined),
        noteMono: !noteText && fromCents !== null,
        checked,
      };
    });
  }

  const taxRows = Array.isArray(pay.tax)
    ? (pay.tax as Record<string, unknown>[]).map((t) => ({
        region: str(t, "region") ?? "",
        rate:
          typeof t.ratePct === "number"
            ? `${t.ratePct.toFixed(2)}%`
            : (str(t, "rate") ?? ""),
        collecting: str(t, "collecting") ?? "",
        muted: str(t, "collecting") === "Below thresholds",
      }))
    : SETTINGS_DEFAULTS.taxRows;

  const alertRows = Array.isArray(r.alerts)
    ? (r.alerts as Record<string, unknown>[]).map((a) => ({
        when: str(a, "when") ?? "",
        tell: str(a, "who", "tell") ?? "",
        how: str(a, "how") ?? "",
      }))
    : SETTINGS_DEFAULTS.alertRows;

  return {
    fields,
    draft,
    carriers,
    boxOptions:
      Array.isArray(ful.boxOptions) && ful.boxOptions.length > 0
        ? (ful.boxOptions as string[])
        : SETTINGS_DEFAULTS.boxOptions,
    stripeAccountEnding: str(pay, "accountEnding") ?? SETTINGS_DEFAULTS.stripeAccountEnding,
    payoutSchedule:
      (str(pay, "payoutScheduleLabel") ?? SETTINGS_DEFAULTS.payoutSchedule.replace(/\.$/, "")) + ".",
    nextPayout:
      typeof pay.nextPayoutCents === "number"
        ? moneyFromCents(pay.nextPayoutCents)
        : SETTINGS_DEFAULTS.nextPayout,
    nextPayoutDate: str(pay, "nextPayoutLabel") ?? SETTINGS_DEFAULTS.nextPayoutDate,
    payoutAccountEnding: str(pay, "bankEnding") ?? SETTINGS_DEFAULTS.payoutAccountEnding,
    taxRows: taxRows.length > 0 ? taxRows : SETTINGS_DEFAULTS.taxRows,
    alertRows: alertRows.length > 0 ? alertRows : SETTINGS_DEFAULTS.alertRows,
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
  /** Selectable roles; null = fixed role shown as a Stamp (Owner). */
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

/* Role selects as drawn in Team.html (the fixture carries no options). */
const ROLE_OPTIONS: Record<string, string[] | null> = {
  sheku: null,
  kofi: ["Fulfillment", "Customer service", "Manager"],
  rosa: ["Customer service", "Fulfillment", "Manager"],
  ben: ["Bookkeeper", "Manager"],
};

const AVATAR_TONES: Record<string, TeamMember["avatarTone"]> = {
  sheku: "a",
  kofi: "b",
  rosa: "c",
  ben: "b",
};

export const TEAM_DEFAULTS: { members: TeamMember[]; invites: TeamInvite[] } = {
  members: [
    { id: "sheku", name: "Sheku Koroma", email: "sheku@sevynlabs.io", initials: "SK", avatarTone: "a", role: "Owner", roleOptions: null, lastIn: "Now", you: true },
    { id: "kofi", name: "Kofi Mensah", email: "kofi@sevynlabs.io", initials: "KM", avatarTone: "b", role: "Fulfillment", roleOptions: ROLE_OPTIONS.kofi ?? null, lastIn: "9:58 AM" },
    { id: "rosa", name: "Rosa Delgado", email: "rosa@sevynlabs.io", initials: "RD", avatarTone: "c", role: "Customer service", roleOptions: ROLE_OPTIONS.rosa ?? null, lastIn: "Yesterday" },
    { id: "ben", name: "Ben Hart", email: "ben@sevynlabs.io", initials: "BH", avatarTone: "b", role: "Bookkeeper", roleOptions: ROLE_OPTIONS.ben ?? null, lastIn: "Oct 1" },
  ],
  invites: [
    {
      id: "invite-jules",
      email: "jules@sevynlabs.io",
      role: "Fulfillment",
      note: "Invited Oct 5 by you · expires Oct 12",
      lastIn: "Not joined",
    },
  ],
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

function normalizeInvite(o: Record<string, unknown>, i: number): TeamInvite {
  const invitedBy = str(o, "invitedByLabel");
  const expires = str(o, "expiresLabel", "expires");
  return {
    id: str(o, "id") ?? `invite-${i}`,
    email: str(o, "email") ?? "",
    role: str(o, "role") ?? "Fulfillment",
    note:
      str(o, "note") ??
      (invitedBy
        ? `${invitedBy}${expires ? ` · expires ${expires}` : ""}`
        : "Invited Oct 5 by you · expires Oct 12"),
    lastIn: str(o, "lastInLabel", "lastIn") ?? "Not joined",
  };
}

/** Translate an api getTeam() result ({ members, invite }) to the page
   shape. Also accepts { members, invites[] } and bare member arrays. */
export function normalizeTeam(raw: unknown): { members: TeamMember[]; invites: TeamInvite[] } {
  if (!raw || typeof raw !== "object") return TEAM_DEFAULTS;
  const r = raw as Record<string, unknown>;
  const rawMembers = (Array.isArray(raw) ? raw : (r.members ?? r.people)) as unknown;
  if (!Array.isArray(rawMembers) || rawMembers.length === 0) return TEAM_DEFAULTS;

  const tones: TeamMember["avatarTone"][] = ["a", "b", "c", "b"];
  const members: TeamMember[] = rawMembers.map((m, i) => {
    const o = (m ?? {}) as Record<string, unknown>;
    const id = str(o, "id") ?? `member-${i}`;
    const name = str(o, "name", "fullName") ?? TEAM_DEFAULTS.members[i]?.name ?? "Team member";
    const role = str(o, "role") ?? "Fulfillment";
    const fallback = TEAM_DEFAULTS.members.find((d) => d.id === id || d.name === name);
    return {
      id,
      name,
      email: str(o, "email") ?? fallback?.email ?? "",
      initials: str(o, "initials") ?? initialsOf(name),
      avatarTone: AVATAR_TONES[id] ?? fallback?.avatarTone ?? tones[i % tones.length] ?? "a",
      role,
      roleOptions:
        (Array.isArray(o.roleOptions) ? (o.roleOptions as string[]) : undefined) ??
        ROLE_OPTIONS[id] ??
        fallback?.roleOptions ??
        (role === "Owner" ? null : [role, "Manager"]),
      lastIn: str(o, "lastInLabel", "lastIn", "lastSeen") ?? fallback?.lastIn ?? "",
      you: Boolean(o.isYou ?? o.you ?? fallback?.you),
    };
  });

  let invites: TeamInvite[] = [];
  if (Array.isArray(r.invites)) {
    invites = (r.invites as Record<string, unknown>[]).map(normalizeInvite);
  } else if (r.invite && typeof r.invite === "object") {
    invites = [normalizeInvite(r.invite as Record<string, unknown>, 0)];
  }
  if (invites.length === 0) invites = TEAM_DEFAULTS.invites;

  return { members, invites };
}

/* ---------------- Permission matrix (A-01) ---------------- */

/* Columns as drawn in Team.html — Owner is excluded from the grid and
   covered by the panel caption "Owner can do everything". */
export const PERMISSION_ROLES = ["Manager", "Fulfillment", "Customer service", "Bookkeeper"];

export const PERMISSION_DEFAULTS: { roles: string[]; rows: { capability: string; values: string[] }[] } = {
  roles: PERMISSION_ROLES,
  rows: [
    { capability: "Pick, pack and ship orders", values: ["Yes", "Yes", "View", "View"] },
    { capability: "Adjust stock and receive deliveries", values: ["Yes", "Yes", "No", "View"] },
    { capability: "Refund orders", values: ["Yes", "No", "Up to $100", "No"] },
    { capability: "Edit products, prices and discounts", values: ["Yes", "No", "No", "No"] },
    { capability: "See revenue, payouts and costs", values: ["Yes", "No", "No", "Yes"] },
    { capability: "Change settings and team", values: ["No", "No", "No", "No"] },
  ],
};

/** Translate an api getPermissionMatrix() result (PermissionRow[] with
   values as a Record<Role, string>) to the component's shape. */
export function normalizePermissions(raw: unknown): typeof PERMISSION_DEFAULTS {
  const rowsRaw = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? (raw as Record<string, unknown>).rows
      : null;
  if (!Array.isArray(rowsRaw) || rowsRaw.length === 0) return PERMISSION_DEFAULTS;
  const rows = rowsRaw.map((row) => {
    const o = (row ?? {}) as Record<string, unknown>;
    const capability = str(o, "capability", "label") ?? "";
    if (Array.isArray(o.values)) {
      return { capability, values: o.values as string[] };
    }
    const record = (o.values ?? o) as Record<string, unknown>;
    return {
      capability,
      values: PERMISSION_ROLES.map((role) => {
        const v = record[role];
        return typeof v === "string" ? v : "No";
      }),
    };
  });
  return { roles: PERMISSION_ROLES, rows };
}

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

export const AUDIT_TOTAL_DEFAULT = 64;
export const AUDIT_SHOWN_DEFAULT = 9;

/* The nine entries drawn in AuditHistory.html, with their rich
   "what changed" markup (mono codes, links, struck → new values). The
   fixture's plain text is matched onto these by time + actor so the
   drawn rows render exactly as the screen; the fixture's extra entries
   render from their plain text with codes auto-set in mono. */
export const AUDIT_SCREEN_ENTRIES: (Pick<
  AuditEntry,
  "time" | "who" | "segments" | "plain" | "kindLabel" | "kindTone"
> & { moneyLabel?: string })[] = [
  {
    time: "10:44",
    who: "System",
    segments: [
      { t: "text", text: "Reserved stock for " },
      { t: "link", text: "ORD-1053", href: "#" },
      { t: "text", text: " · " },
      { t: "mono", text: "LA-CHR" },
      { t: "text", text: " " },
      { t: "change", from: "3", to: "2" },
      { t: "text", text: ", " },
      { t: "mono", text: "NP-4N" },
      { t: "text", text: " " },
      { t: "change", from: "12", to: "11" },
      { t: "text", text: " available" },
    ],
    plain: "Reserved stock for ORD-1053 · LA-CHR 3→2, NP-4N 12→11 available",
    kindLabel: "Stock",
    kindTone: "slate",
  },
  {
    time: "10:12",
    who: "Kofi Mensah",
    segments: [
      { t: "text", text: "Flagged count mismatch on " },
      { t: "link", text: "CT-NAT", href: "/admin/inventory" },
      { t: "text", text: ", shelf B-14 · counted 4, system says 6. Not adjusted yet." },
    ],
    plain: "Flagged count mismatch on CT-NAT, shelf B-14 · counted 4, system says 6. Not adjusted yet.",
    kindLabel: "Needs review",
    kindTone: "tape",
  },
  {
    time: "09:31",
    who: "Rosa Delgado",
    segments: [
      { t: "text", text: "Refunded " },
      { t: "link", text: "ORD-1031", href: "/admin/orders/ORD-1031" },
      { t: "text", text: " in part · napkins arrived stained. “Photo on file.”" },
    ],
    plain: "Refunded ORD-1031 in part · napkins arrived stained. “Photo on file.”",
    kindLabel: "Money",
    kindTone: "problem",
  },
  {
    time: "08:15",
    who: "System",
    segments: [
      { t: "text", text: "Payment failed on " },
      { t: "link", text: "ORD-1046", href: "/admin/orders/ORD-1046" },
      { t: "text", text: ", Jordan Bell · card declined. Order held; no stock deducted." },
    ],
    plain: "Payment failed on ORD-1046, Jordan Bell · card declined. Order held; no stock deducted.",
    kindLabel: "Money",
    kindTone: "problem",
    moneyLabel: "$214.00 held",
  },
  {
    time: "16:40",
    who: "Kofi Mensah",
    segments: [
      { t: "text", text: "Wrote off 2 × " },
      { t: "mono", text: "EC-WHT" },
      { t: "text", text: " enamel colander · damaged in delivery. Reason: " },
      { t: "italic", text: "Damaged" },
      { t: "text", text: "." },
    ],
    plain: "Wrote off 2 × EC-WHT enamel colander · damaged in delivery. Reason: Damaged.",
    kindLabel: "Stock",
    kindTone: "slate",
  },
  {
    time: "14:15",
    who: "Sheku Koroma",
    segments: [
      { t: "text", text: "Invited " },
      { t: "mono", text: "jules@sevynlabs.io" },
      { t: "text", text: " as Fulfillment" },
    ],
    plain: "Invited jules@sevynlabs.io as Fulfillment",
    kindLabel: "Access",
    kindTone: "ink",
  },
  {
    time: "11:05",
    who: "Sheku Koroma",
    segments: [
      { t: "text", text: "Changed price on Oak serving board, Large " },
      { t: "change", from: "$180.00", to: "$190.00" },
      { t: "text", text: " · new timber cost from the maker" },
    ],
    plain: "Changed price on Oak serving board, Large $180.00→$190.00 · new timber cost from the maker",
    kindLabel: "Price",
    kindTone: "ink",
  },
  {
    time: "09:20",
    who: "Kofi Mensah",
    segments: [
      { t: "text", text: "Received " },
      { t: "link", text: "PO-0211", href: "#" },
      { t: "text", text: " · 36 × " },
      { t: "mono", text: "NP-4N" },
      { t: "text", text: " linen napkins, Natural, all counted" },
    ],
    plain: "Received PO-0211 · 36 × NP-4N linen napkins, Natural, all counted",
    kindLabel: "Received",
    kindTone: "paid",
  },
  {
    time: "08:47",
    who: "Sheku Koroma",
    segments: [
      { t: "text", text: "Scheduled discount " },
      { t: "mono", text: "FREESHIP75" },
      { t: "text", text: " · Oct 15 – Nov 1" },
    ],
    plain: "Scheduled discount FREESHIP75 · Oct 15 – Nov 1",
    kindLabel: "Price",
    kindTone: "ink",
  },
];

const KIND_TONES: Record<string, StampTone> = {
  Stock: "slate",
  Money: "problem",
  Price: "ink",
  Cost: "ink",
  Access: "ink",
  Received: "paid",
  "Needs review": "tape",
};

const KIND_FILTER: Record<string, AuditEntry["filterKind"]> = {
  stock: "Stock",
  money: "Money",
  price: "Prices and cost",
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

function screenMatch(time: string, who: string) {
  return AUDIT_SCREEN_ENTRIES.find((e) => e.time === time && e.who === who);
}

function mapAuditEntry(o: Record<string, unknown>, i: number): AuditEntry {
  const time = str(o, "timeLabel", "time") ?? "";
  const who = str(o, "actorName", "who", "actor") ?? "System";
  const text = str(o, "text", "plain", "what", "description") ?? "";
  const kindRaw = str(o, "kind") ?? "";
  const kindLabel = str(o, "stampLabel", "kindLabel") ?? "Stock";
  const moneyCents =
    typeof o.moneyCents === "number" ? o.moneyCents : null;
  const oldValue = typeof o.oldValue === "string" ? o.oldValue : null;
  const newValue = typeof o.newValue === "string" ? o.newValue : null;
  const screen = screenMatch(time, who);

  let money: string | undefined;
  let moneyKind: AuditEntry["moneyKind"] = null;
  if (screen?.moneyLabel) {
    money = screen.moneyLabel;
    moneyKind = "held";
  } else if (moneyCents !== null && moneyCents < 0) {
    money = moneyFromCents(moneyCents);
    moneyKind = "out";
  } else if (moneyCents !== null && moneyCents > 0) {
    money = /held/i.test(text) ? `${moneyFromCents(moneyCents)} held` : moneyFromCents(moneyCents);
    moneyKind = /held/i.test(text) ? "held" : "in";
  }

  return {
    id: str(o, "id") ?? `entry-${i}`,
    dayLabel: str(o, "dayGroup", "dayLabel", "day") ?? "Today · Tue, Oct 6",
    dateISO: str(o, "dateISO", "date") ?? "2026-10-06",
    time,
    who,
    system: who === "System",
    segments: screen ? screen.segments : segmentsFromText(text, oldValue, newValue),
    plain: screen ? screen.plain : text,
    kindLabel: screen?.kindLabel ?? kindLabel,
    kindTone: screen?.kindTone ?? KIND_TONES[kindLabel] ?? "slate",
    filterKind: KIND_FILTER[kindRaw.toLowerCase()] ?? "Stock",
    money,
    moneyCents,
    moneyKind,
  };
}

/* The drawn nine as full entries — only used if listAudit() itself
   fails, so A-03 still renders the screen. */
const AUDIT_FALLBACK_META: Record<
  string,
  { dayLabel: string; dateISO: string; filterKind: AuditEntry["filterKind"]; moneyCents: number | null }
> = {
  "10:44|System": { dayLabel: "Today · Tue, Oct 6", dateISO: "2026-10-06", filterKind: "Stock", moneyCents: null },
  "10:12|Kofi Mensah": { dayLabel: "Today · Tue, Oct 6", dateISO: "2026-10-06", filterKind: "Stock", moneyCents: null },
  "09:31|Rosa Delgado": { dayLabel: "Today · Tue, Oct 6", dateISO: "2026-10-06", filterKind: "Money", moneyCents: -3600 },
  "08:15|System": { dayLabel: "Today · Tue, Oct 6", dateISO: "2026-10-06", filterKind: "Money", moneyCents: 21400 },
  "16:40|Kofi Mensah": { dayLabel: "Mon, Oct 5", dateISO: "2026-10-05", filterKind: "Stock", moneyCents: -4300 },
  "14:15|Sheku Koroma": { dayLabel: "Mon, Oct 5", dateISO: "2026-10-05", filterKind: "Access", moneyCents: null },
  "11:05|Sheku Koroma": { dayLabel: "Mon, Oct 5", dateISO: "2026-10-05", filterKind: "Prices and cost", moneyCents: null },
  "09:20|Kofi Mensah": { dayLabel: "Fri, Oct 2", dateISO: "2026-10-02", filterKind: "Stock", moneyCents: null },
  "08:47|Sheku Koroma": { dayLabel: "Fri, Oct 2", dateISO: "2026-10-02", filterKind: "Prices and cost", moneyCents: null },
};

function auditFallbackEntries(): AuditEntry[] {
  return AUDIT_SCREEN_ENTRIES.map((e, i) => {
    const meta = AUDIT_FALLBACK_META[`${e.time}|${e.who}`];
    return {
      id: `fallback-${i}`,
      dayLabel: meta?.dayLabel ?? "Today · Tue, Oct 6",
      dateISO: meta?.dateISO ?? "2026-10-06",
      time: e.time,
      who: e.who,
      system: e.who === "System",
      segments: e.segments,
      plain: e.plain,
      kindLabel: e.kindLabel,
      kindTone: e.kindTone,
      filterKind: meta?.filterKind ?? "Stock",
      money:
        e.moneyLabel ??
        (meta?.moneyCents ? moneyFromCents(meta.moneyCents) : undefined),
      moneyCents: meta?.moneyCents ?? null,
      moneyKind: e.moneyLabel
        ? "held"
        : meta?.moneyCents
          ? meta.moneyCents < 0
            ? "out"
            : "in"
          : null,
    };
  });
}

/** Translate an api listAudit() result ({ entries, totalCount,
   shownCount }) to the page shape. Entries are ordered so the nine
   drawn in AuditHistory.html come first (in screen order); the rest
   follow in fixture order, revealed by "Load 20 more". */
export function normalizeAudit(raw: unknown): {
  entries: AuditEntry[];
  total: number;
  shown: number;
} {
  if (!raw || typeof raw !== "object") {
    return {
      entries: auditFallbackEntries(),
      total: AUDIT_TOTAL_DEFAULT,
      shown: AUDIT_SHOWN_DEFAULT,
    };
  }
  const r = raw as Record<string, unknown>;
  const list = Array.isArray(r.entries) ? (r.entries as Record<string, unknown>[]) : [];
  const total = typeof r.totalCount === "number" ? r.totalCount : AUDIT_TOTAL_DEFAULT;
  const shown = typeof r.shownCount === "number" ? r.shownCount : AUDIT_SHOWN_DEFAULT;
  const mapped = list.map(mapAuditEntry);
  if (mapped.length === 0) return { entries: auditFallbackEntries(), total, shown };
  const screenOrder = new Map(
    AUDIT_SCREEN_ENTRIES.map((e, idx) => [`${e.time}|${e.who}`, idx]),
  );
  const key = (e: AuditEntry) => `${e.time}|${e.who}`;
  const drawn = mapped
    .filter((e) => screenOrder.has(key(e)))
    .sort((a, b) => (screenOrder.get(key(a)) ?? 0) - (screenOrder.get(key(b)) ?? 0));
  const rest = mapped.filter((e) => !screenOrder.has(key(e)));
  return { entries: [...drawn, ...rest], total, shown };
}

/** Normalise one live entry from the client store's auditLog into the
   same shape (live entries are prepended under Today on A-03). */
export function normalizeLiveAuditEntry(raw: unknown, index: number): AuditEntry {
  const o = (raw ?? {}) as Record<string, unknown>;
  /* The store's AuditEntry shape (lib/types) is the same as the api's. */
  if (typeof o.text === "string" || typeof o.actorName === "string") {
    const entry = mapAuditEntry(o, index);
    return { ...entry, dayLabel: "Today · Tue, Oct 6", dateISO: "2026-10-06" };
  }
  const plain =
    str(o, "plain", "what", "description", "label") ?? "Recorded a change";
  const kindLabel = str(o, "kindLabel", "kind") ?? "Stock";
  const moneyCents = typeof o.moneyCents === "number" ? o.moneyCents : null;
  return {
    id: str(o, "id") ?? `live-${index}`,
    dayLabel: "Today · Tue, Oct 6",
    dateISO: "2026-10-06",
    time: str(o, "timeLabel", "time") ?? "10:48",
    who: str(o, "actorName", "who", "actor") ?? "Sheku Koroma",
    system: str(o, "actorName", "who", "actor") === "System",
    segments: segmentsFromText(plain, null, null),
    plain,
    kindLabel,
    kindTone: KIND_TONES[kindLabel] ?? "slate",
    filterKind: KIND_FILTER[kindLabel.toLowerCase()] ?? "Stock",
    money:
      moneyCents !== null ? moneyFromCents(moneyCents) : undefined,
    moneyCents,
    moneyKind: moneyCents === null ? null : moneyCents < 0 ? "out" : "in",
  };
}
