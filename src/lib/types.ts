/* Stockroom v2 — shared entity types. Money is always integer cents.
   Fixtures under src/data/*.json are the single source; lib/api.ts derives
   every displayed number from them (HANDOVER §9/§10). */

export type StampTone = "paid" | "tape" | "problem" | "ink" | "slate" | "muted";

export interface Shop {
  name: string;
  shortName: string;
  tagline: string;
  address: string;
  pickupAddress: string;
  email: string;
  timezone: string;
  todayISO: string;
  todayLabel: string;
  dayHeroLabel: string;
  cutoffLabel: string;
  /** Minutes after midnight ET. */
  cutoffMinutes: number;
  pickupHours: string;
  pickupDaysLabel: string;
  taxRegion: string;
  taxRatePct: number;
  last7Days: {
    rangeLabel: string;
    revenueChangePct: number;
    ordersVsLastWeek: number;
    revenueByDay: RevenueDay[];
  };
}

export interface RevenueDay {
  dateISO: string;
  dateLabel: string;
  dayLabel: string;
  orders: number;
  revenueCents: number;
  /** Annotation drawn on the bar chart, e.g. "Mug out" on the dip day. */
  note?: string;
}

/* ---------------- team & permissions ---------------- */

export type Role = "Owner" | "Manager" | "Fulfillment" | "Customer service" | "Bookkeeper";

export interface TeamMember {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: Role;
  lastInLabel: string;
  isYou: boolean;
  /** Refund ceiling in cents; null = no limit (Owner). 0 = cannot refund. */
  refundLimitCents: number | null;
}

export interface TeamInvite {
  email: string;
  role: Role;
  invitedByLabel: string;
  expiresLabel: string;
  lastInLabel: string;
}

export interface PermissionRow {
  capability: string;
  /** Role → answer in words: "Yes" / "No" / "View" / "Up to $100". */
  values: Record<Role, string>;
}

/* ---------------- catalogue & stock ---------------- */

export type ProductStatus = "active" | "draft" | "archived";

export interface IncomingStock {
  qty: number;
  dayLabel: string;
  poId: string;
}

export interface SkuVariant {
  sku: string;
  label: string;
  shelf: string;
  onShelf: number;
  committed: number;
  reorderPoint: number;
  priceCents: number;
  costCents: number | null;
  /** Compare-at (was) price in cents; null = none. DB-mapped variants
   *  carry the real product_variants.compare_at_price; fixture
   *  variants may omit it. */
  compareAtCents?: number | null;
  incoming?: IncomingStock;
  countPending?: boolean;
  waitlist?: number;
  /** Safety-stock threshold where set (drives the ledger "below safety" count). */
  safetyPoint?: number;
}

export interface Product {
  slug: string;
  name: string;
  collection: string;
  status: ProductStatus;
  /** Base/display price in cents ("from" price when variants differ). */
  priceCents: number;
  sold30d: number;
  storefront: string;
  backorder: boolean;
  supplier: string | null;
  description: string | null;
  variants: SkuVariant[];
}

/** A variant flattened with its product context — what inventory works with. */
export interface Sku extends SkuVariant {
  productSlug: string;
  productName: string;
  collection: string;
  productStatus: ProductStatus;
  backorder: boolean;
}

export interface InventorySummary {
  belowReorder: number;
  atZero: number;
  countPending: number;
  totalSkus: number;
  onHand: number;
  committed: number;
  arrivingThisWeek: number;
}

export interface PurchaseOrderLine {
  sku: string;
  qty: number;
}

export interface PurchaseOrder {
  id: string;
  supplier: string;
  dayLabel: string;
  dateISO: string;
  lines: PurchaseOrderLine[];
  status: string;
}

export interface StockMovement {
  id: string;
  timeLabel: string;
  text: string;
  sku: string | null;
  deltaLabel: string;
  kind: string;
}

/* ---------------- orders ---------------- */

export type OrderStage = "held" | "to-pick" | "packing" | "ready" | "shipped" | "delivered";
export type PaymentStatus = "paid" | "failed" | "partially-refunded" | "refunded" | "refund-requested" | "pending";
export type HoldKind = "stock" | "payment" | "address" | "review";

export interface OrderLine {
  sku: string | null;
  label: string;
  qty: number;
  unitPriceCents: number;
  shelf?: string;
}

export interface OrderHold {
  kind: HoldKind;
  tone: StampTone;
  title: string;
  reason: string;
  detail?: string;
  sku?: string;
  shelf?: string;
  systemCount?: number;
  countedCount?: number;
  countedBy?: string;
  countedAtLabel?: string;
  flaggedAtLabel?: string;
}

export interface OrderPayment {
  status: "paid" | "failed";
  cardLast4?: string;
  capturedLabel?: string;
  attempts?: number;
  maxAttempts?: number;
  lastAttemptLabel?: string;
  declineReason?: string;
  holdExpiresLabel?: string;
  payLinkSentLabel?: string;
  payLinkOpenedLabel?: string;
  processorFeeCents?: number;
  receivedCents?: number;
  refundableCents?: number;
}

export interface OrderHistoryEntry {
  timeLabel: string;
  text: string;
}

export interface RefundRequest {
  amountCents: number;
  reasonLabel: string;
  restock: boolean;
  note: string;
  requestedBy: string;
}

export interface Order {
  /** DB orders.id (uuid). Actions take this; `id` stays the order_number
   *  used by routes/display. Fixture orders carry an empty string. */
  uuid: string;
  id: string;
  customerSlug: string | null;
  customerName: string;
  placedLabel: string;
  placedDay: "today" | "yesterday" | "earlier";
  channel: "online" | "counter";
  stage: OrderStage;
  stageLabel: string;
  shipByLabel: string;
  shipByMinutes: number | null;
  lines: OrderLine[];
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  paymentStatus: PaymentStatus;
  payment?: OrderPayment;
  hold: OrderHold | null;
  refundedCents: number;
  refundRequest?: RefundRequest;
  shipTo?: string;
  changeUntilLabel?: string;
  arrivesLabel?: string;
  history?: OrderHistoryEntry[];
}

export interface OrdersSummary {
  openCount: number;
  openTotalCents: number;
  heldCount: number;
  toFulfillCount: number;
  pickCount: number;
  packCount: number;
  readyCount: number;
  shippedTodayCount: number;
  refundsCount: number;
}

/* ---------------- dashboard ---------------- */

export interface DashboardException {
  id: string;
  kind: "order" | "stock";
  tone: StampTone;
  orderId: string | null;
  sku: string | null;
  stampLabel: string;
  title: string;
  reason: string;
  codesLabel: string;
  actorLabel: string | null;
}

export interface Ledger7 {
  rangeLabel: string;
  revenueCents: number;
  revenueChangePct: number;
  orders: number;
  ordersVsLastWeek: number;
  heldOrders: number;
  lowStockSkus: number;
  belowSafety: number;
  atZero: number;
  revenueByDay: RevenueDay[];
  peakCents: number;
}

export interface DashboardData {
  todayLabel: string;
  dayHeroLabel: string;
  cutoffLabel: string;
  pipeline: { shipped: number; ready: number; packing: number; toPick: number };
  toGoToday: number;
  exceptions: DashboardException[];
  moreHeldCount: number;
  fulfillmentQueue: Order[];
  fulfillmentTotal: number;
  ledger7: Ledger7;
  inventoryWatch: Sku[];
}

/* ---------------- customers ---------------- */

export interface CustomerWaitingFor {
  sku: string;
  productName: string;
  note: string;
}

export interface CustomerNote {
  dateLabel: string;
  text: string;
}

export interface CustomerOrderRef {
  orderId: string;
  dateLabel: string;
  itemsLabel: string;
  totalCents: number;
  statusLabel: string;
}

export interface Customer {
  slug: string;
  name: string;
  initials: string;
  type: "customer" | "wholesale";
  email: string;
  location: string;
  sinceLabel: string;
  sinceFullLabel: string;
  orderCount: number;
  spentCents: number;
  returns: number;
  tags: string[];
  emailSubscribed: string | null;
  textSubscribed: boolean;
  address: string | null;
  wholesale?: { discountPct: number; termsLabel: string; code: string };
  lastOrder: { orderId: string; dateLabel: string; statusLabel: string } | null;
  waitingFor: CustomerWaitingFor | null;
  notes: CustomerNote[];
  orderHistory: CustomerOrderRef[];
}

export interface CustomersTotals {
  total: number;
  returning: number;
  waitingOnRestock: number;
  wholesale: number;
  openOrders: number;
}

/* ---------------- discounts ---------------- */

export type DiscountStatus = "running" | "scheduled" | "ended";

export interface Discount {
  code: string;
  kind: "percent" | "free-shipping" | "fixed-amount";
  pct: number | null;
  whatLabel: string;
  whoLabel: string;
  whenLabel: string;
  startsLabel?: string;
  endsLabel?: string;
  startsInLabel?: string;
  endedReasonLabel?: string;
  status: DiscountStatus;
  uses: number;
  useLimit: number | null;
  givenCents30d: number;
  minOrderCents: number;
  usesPerCustomer?: number;
  wholesale?: boolean;
  /* Console extras (additive; present on DB-mapped discounts from
   * lib/shop/admin, absent on fixture discounts): raw fields the
   * discount builder needs without parsing display labels. */
  id?: string;
  uuid?: string;
  startsAt?: string;
  endsAt?: string | null;
  /** Integer cents of the raw discounts.value (15% → 1500; $5 → 500). */
  valueCents?: number;
  /** Raw DB kind: 'percentage' | 'fixed'. */
  dbKind?: string;
  rawKind?: string;
  estimate?: { qualifyingOrders: number; avgLabelCents: number; coverCents: number };
  bannerLabel?: string;
}

export interface DiscountTotals {
  givenCents30d: number;
  ordersCents30d: number;
  avgPct: number;
}

/* ---------------- audit ---------------- */

export type AuditKind = "stock" | "money" | "price" | "access";

export interface AuditEntry {
  id: string;
  dateISO: string;
  /** Group header as drawn, e.g. "Today · Tue, Oct 6". */
  dayGroup: string;
  timeLabel: string;
  actorId: string | null;
  actorName: string;
  text: string;
  kind: AuditKind;
  stampLabel: string | null;
  moneyCents: number | null;
  oldValue: string | null;
  newValue: string | null;
}

export interface AuditList {
  entries: AuditEntry[];
  totalCount: number;
  shownCount: number;
}

/* ---------------- settings ---------------- */

export interface ShopSettings {
  unsavedCount: number;
  store: {
    name: string;
    address: string;
    pickupDays: string;
    pickupOpens: string;
    pickupCloses: string;
    replyEmail: string;
  };
  fulfillment: {
    cutoffSavedLabel: string;
    cutoffDraftLabel: string;
    cutoffChanged: boolean;
    carriers: { name: string; fromCents: number; note?: string }[];
    defaultBoxSaved: string;
    defaultBoxDraft: string;
    defaultBoxChanged: boolean;
    boxOptions: string[];
    slipNote: string;
  };
  payments: {
    provider: string;
    status: string;
    accountEnding: string;
    payoutScheduleLabel: string;
    nextPayoutCents: number;
    nextPayoutLabel: string;
    bankEnding: string;
    tax: { region: string; ratePct: number; collecting: string }[];
  };
  alerts: { when: string; who: string; how: string }[];
}

/* ---------------- store (client state) ---------------- */

export interface CartItem {
  sku: string;
  qty: number;
}

export interface ConnectionState {
  online: boolean;
  /** Drawn "11:42 AM"-style label: when the data was last current. */
  asOfLabel: string;
  queue: string[];
}

export type RefundResult =
  | { ok: true }
  | { ok: false; reason: "over-limit" | "not-found" | "not-refundable"; limit?: number };

export type RetryResult =
  | { ok: true }
  | { ok: false; reason: "not-found" | "not-failed" | "max-attempts" | "declined-again" };

export type AddToCartResult = { ok: true } | { ok: false; reason: "sold-out" | "not-found" };
