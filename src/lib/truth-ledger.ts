/**
 * Truth ledger — the canonical Stockroom demo facts (Flagship UI Designs,
 * stockroomProto + roundFive.truth). These values are the design's fixed
 * reference data and must be IDENTICAL everywhere they appear: the dashboard
 * ops ledger, the orders queue, the ORD-1048 packing slip, and the inventory
 * watch. Import from here instead of re-typing a fact.
 */

export interface TruthOrderItem {
  name: string;
  sku: string;
  qty: number;
  unitPrice: number;
}

export interface TruthTimelineEvent {
  time: string;
  title: string;
  detail: string;
}

export const TRUTH_ORDER = {
  orderNumber: "ORD-1048",
  customer: "Avery Lewis",
  itemCount: 2,
  items: [
    { name: "Linen apron — Charcoal", sku: "LA-CHR", qty: 1, unitPrice: 78.0 },
    { name: "Canvas market tote", sku: "CT-NAT", qty: 1, unitPrice: 42.0 },
  ] as TruthOrderItem[],
  subtotal: 120.0,
  shipping: 8.0,
  total: 128.0,
  totalLabel: "$128.00",
  status: "Stock hold",
  paidAt: "Paid October 6, 2026 at 8:14 AM",
  tracking: "1Z-84A-020-0395",
  shipTo: ["Avery Lewis", "1842 Pine Street", "Philadelphia, PA 19103"],
  timeline: [
    { time: "Oct 6 · 8:14 AM", title: "Payment captured", detail: "Visa ending 2048 · $128.00" },
    { time: "Oct 6 · 8:16 AM", title: "Inventory reserved", detail: "2 units held for this order" },
    { time: "Oct 6 · 9:02 AM", title: "Picking started", detail: "Maya Jordan · aisle B" },
    {
      time: "Oct 6 · 9:18 AM",
      title: "Stock check requested",
      detail: "Canvas market tote count mismatch",
    },
  ] as TruthTimelineEvent[],
} as const;

export interface SignatureOrder {
  orderNumber: string;
  customer: string;
  items: number;
  total: string;
  totalCents: number;
  status: string;
}

/** The eight-order fulfillment queue (Flagship UI Designs, stockroom Orders). */
export const SIGNATURE_QUEUE: readonly SignatureOrder[] = [
  { orderNumber: "ORD-1048", customer: "Avery Lewis", items: 2, total: "$128.00", totalCents: 12800, status: "Stock hold" },
  { orderNumber: "#1047", customer: "Morgan Reed", items: 1, total: "$86.50", totalCents: 8650, status: "Label created" },
  { orderNumber: "#1046", customer: "Jordan Bell", items: 3, total: "$214.00", totalCents: 21400, status: "Payment review" },
  { orderNumber: "#1045", customer: "Elena Park", items: 1, total: "$72.00", totalCents: 7200, status: "Fulfilled" },
  { orderNumber: "#1044", customer: "Noah Williams", items: 4, total: "$186.40", totalCents: 18640, status: "Ready to fulfill" },
  { orderNumber: "#1043", customer: "Leah Kim", items: 2, total: "$98.00", totalCents: 9800, status: "Fulfilled" },
  { orderNumber: "#1042", customer: "Micah Stone", items: 1, total: "$48.00", totalCents: 4800, status: "Cancelled" },
  { orderNumber: "#1041", customer: "Nia Brooks", items: 3, total: "$164.75", totalCents: 16475, status: "Label created" },
] as const;

export const QUEUE_STATUSES = [
  "All orders",
  "Ready to fulfill",
  "Stock hold",
  "Label created",
  "Payment review",
  "Fulfilled",
  "Cancelled",
] as const;

export interface WatchFacts {
  product: string;
  variant: string;
  sku: string;
  onHand: number;
  reorderAt: number;
  status: "Low stock" | "Out of stock" | "Healthy";
}

/** Inventory watch rows (Flagship UI Designs, stockroomProto). */
export const SIGNATURE_WATCH: readonly WatchFacts[] = [
  { product: "Linen apron", variant: "Charcoal", sku: "LA-CHR", onHand: 3, reorderAt: 12, status: "Low stock" },
  { product: "Stoneware mug", variant: "Terracotta", sku: "SM-TER", onHand: 0, reorderAt: 18, status: "Out of stock" },
  { product: "Canvas market tote", variant: "", sku: "CT-NAT", onHand: 5, reorderAt: 10, status: "Low stock" },
  { product: "Oak serving board", variant: "", sku: "OSB-LG", onHand: 34, reorderAt: 8, status: "Healthy" },
] as const;

export interface OpsLineFacts {
  label: string;
  value: string;
  note: string;
  href: string;
  exception?: boolean;
}

/** Operations ledger lines (Flagship UI Designs, stockroomProto). */
export const SIGNATURE_OPS_LINES: readonly OpsLineFacts[] = [
  {
    label: "Held orders",
    value: "7",
    note: "ORD-1048 · Avery Lewis · next action: verify stock allocation",
    href: "/orders",
    exception: true,
  },
  {
    label: "Low-stock SKUs",
    value: "18",
    note: "6 below safety stock · 1 at zero",
    href: "/inventory",
    exception: true,
  },
  {
    label: "Net revenue",
    value: "$18,420",
    note: "+8.4% versus prior period",
    href: "/orders",
  },
  {
    label: "Order volume",
    value: "146",
    note: "12 more than last week",
    href: "/orders",
  },
] as const;

export interface PostingWeekFacts {
  label: string;
  revenue: number;
  isDip: boolean;
}

/** Four October revenue postings (Flagship UI Designs, chartData.stockroom). */
export const SIGNATURE_WEEKS: readonly PostingWeekFacts[] = [
  { label: "Oct 1", revenue: 4100, isDip: false },
  { label: "Oct 2", revenue: 4520, isDip: false },
  { label: "Oct 4", revenue: 3980, isDip: true },
  { label: "Oct 6", revenue: 5820, isDip: false },
] as const;

/** Juniper Supply Co. storefront home facts (Flagship UI Designs brief). */
export const STOREFRONT_HOME = {
  brand: "Juniper Supply Co.",
  hero: "Home & Lifestyle Goods",
  categories: ["Kitchen", "Bedroom", "Bathroom", "Living room", "Tabletop"],
  highlights: [
    { name: "Stoneware Mug Set", price: "$48" },
    { name: "Brass Wall Sconce", price: "$86" },
    { name: "Linen Throw Blanket", price: "$92" },
    { name: "Oak Serving Board", price: "$34" },
  ],
} as const;
