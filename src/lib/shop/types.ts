/**
 * Shop DB row types — mirror supabase/migrations 00003/00006/00008/00009
 * exactly (v1 `src/lib/shop/db.ts` shapes, carried over). If a migration
 * changes a table, update these interfaces to match.
 *
 * One published product payload shape (from 00003 DDL + seed.sql; the live
 * catalog is empty as of 2026-10-22, so no live sample exists yet):
 *   products          { id, title, slug, description, category_id, tags[],
 *                       status:'published', created_by, created_at, updated_at }
 *   product_variants  { id, product_id, title, sku, option_values:{"Color":…},
 *                       price:"34.00" (numeric → string over REST),
 *                       compare_at_price, position, created_at, updated_at }
 *   product_images    { id, product_id, storage_path:"<product-id>/gallery/1.jpg",
 *                       alt_text, position, created_at }
 *   inventory_levels  { variant_id, quantity_on_hand, low_stock_threshold, updated_at }
 */

/** Postgres jsonb, mirroring the Supabase-generated `Json` shape. */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ShopCart = {
  id: string;
  guest_token: string;
  user_id: string | null;
  discount_code: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

export type ShopCartItem = {
  id: string;
  cart_id: string;
  variant_id: string;
  quantity: number;
  added_at: string;
};

export type ShopCategory = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  created_at: string;
};

export type ShopProduct = {
  id: string;
  title: string;
  slug: string;
  description: string;
  category_id: string | null;
  tags: string[];
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ShopVariant = {
  id: string;
  product_id: string;
  title: string;
  sku: string;
  option_values: Json;
  /** numeric(12,2) — arrives as a string over PostgREST. */
  price: string | number;
  compare_at_price: string | number | null;
  position: number;
  created_at: string;
  updated_at: string;
  /** 00012 columns — absent until that migration is applied. */
  shelf?: string | null;
  cost_price?: string | number | null;
};

export type ShopProductImage = {
  id: string;
  product_id: string;
  storage_path: string;
  alt_text: string;
  position: number;
  created_at: string;
};

export type ShopInventoryLevel = {
  variant_id: string;
  quantity_on_hand: number;
  low_stock_threshold: number;
  updated_at: string;
};

export type ShopOrder = {
  id: string;
  order_number: string;
  customer_id: string | null;
  status: string;
  payment_status: string;
  subtotal: string | number;
  discount_total: string | number;
  tax_total: string | number;
  shipping_total: string | number;
  total: string | number;
  refunded_total: string | number;
  currency: string;
  discount_code: string | null;
  shipping_address: Json | null;
  tracking_number: string | null;
  source: string;
  external_id: string | null;
  guest_token: string | null;
  stripe_checkout_session_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** 00012 column — absent until that migration is applied. */
  fulfillment_stage?: string | null;
};

export type ShopOrderItem = {
  id: string;
  order_id: string;
  variant_id: string | null;
  product_title: string;
  variant_title: string;
  sku: string;
  quantity: number;
  unit_price: string | number;
  line_total: string | number;
};

export type ShopDiscount = {
  id: string;
  code: string;
  kind: string;
  /** numeric(12,2) — string over PostgREST, number in some payloads. */
  value: string | number;
  usage_limit: number | null;
  per_customer_limit: number | null;
  min_order_value: string | number;
  starts_at: string;
  ends_at: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
};

/* ---- console (admin) tables — migrations 00002/00004/00005/00006/00011/00012 ---- */

export type ShopCustomer = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  notes: string;
  created_at: string;
  updated_at: string;
};

export type ShopCustomerAddress = {
  id: string;
  customer_id: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  is_default: boolean;
};

export type ShopOrderEvent = {
  id: string;
  order_id: string;
  event_type: string;
  message: string;
  metadata: Json | null;
  created_by: string | null;
  created_at: string;
};

export type ShopInventoryAdjustment = {
  id: string;
  variant_id: string;
  delta: number;
  quantity_before: number;
  quantity_after: number;
  reason: string;
  reference: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type ShopAuditLog = {
  id: number;
  actor_id: string | null;
  action: string;
  table_name: string;
  row_id: string;
  before: Json | null;
  after: Json | null;
  created_at: string;
};

export type ShopProfile = {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type ShopUserRole = {
  user_id: string;
  role: string;
  granted_at: string;
  granted_by: string | null;
};

export type ShopStoreSetting = {
  key: string;
  value: Json;
  updated_at: string;
};

export type ShopDiscountRedemption = {
  id: string;
  discount_id: string;
  order_id: string;
  customer_id: string | null;
  amount: string | number;
  created_at: string;
};

/** 00012 — absent until that migration is applied. */
export type ShopPurchaseOrder = {
  id: string;
  supplier: string;
  eta: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** 00012 — absent until that migration is applied. */
export type ShopPurchaseOrderLine = {
  id: string;
  po_id: string;
  variant_id: string | null;
  sku: string;
  qty: number;
};

type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

type TableDef<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: Relationship[];
};

/**
 * Database type for storefront code (shop tables + checkout RPC only).
 *
 * NOTE (from v1): defined as flat object types, NOT intersections.
 * supabase-js indexes `Schema["Tables"][TableName]` with a generic key,
 * and TS resolves an indexed access into an intersection as `A[K] & B[K]`
 * — the member missing the key contributes `never`, collapsing every row
 * type to `never`.
 */
export interface ShopDatabase {
  public: {
    Tables: {
      carts: TableDef<ShopCart>;
      cart_items: TableDef<ShopCartItem>;
      categories: TableDef<ShopCategory>;
      products: TableDef<ShopProduct>;
      product_variants: TableDef<ShopVariant>;
      product_images: TableDef<ShopProductImage>;
      inventory_levels: TableDef<ShopInventoryLevel>;
      orders: TableDef<ShopOrder>;
      order_items: TableDef<ShopOrderItem>;
      discounts: TableDef<ShopDiscount>;
      customers: TableDef<ShopCustomer>;
      customer_addresses: TableDef<ShopCustomerAddress>;
      order_events: TableDef<ShopOrderEvent>;
      inventory_adjustments: TableDef<ShopInventoryAdjustment>;
      audit_log: TableDef<ShopAuditLog>;
      profiles: TableDef<ShopProfile>;
      user_roles: TableDef<ShopUserRole>;
      store_settings: TableDef<ShopStoreSetting>;
      discount_redemptions: TableDef<ShopDiscountRedemption>;
      purchase_orders: TableDef<ShopPurchaseOrder>;
      purchase_order_lines: TableDef<ShopPurchaseOrderLine>;
    };
    Views: { [key: string]: never };
    Functions: {
      create_checkout_session: {
        Args: { p_cart_id: string; p_guest_token: string };
        Returns: string;
      };
      apply_discount_validation: {
        Args: { p_code: string; p_subtotal: number; p_customer_id: string | null };
        Returns: ShopDiscount;
      };
      adjust_inventory: {
        Args: {
          p_variant_id: string;
          p_delta: number;
          p_reason: string;
          p_reference?: string | null;
          p_note?: string | null;
        };
        Returns: number;
      };
      issue_order_refund: {
        Args: { p_order_id: string; p_amount: number; p_reason?: string | null };
        Returns: number;
      };
      set_low_stock_threshold: {
        Args: { p_variant_id: string; p_threshold: number };
        Returns: undefined;
      };
      current_role: {
        Args: Record<string, never>;
        Returns: string;
      };
      is_staff: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: { [key: string]: never };
    CompositeTypes: { [key: string]: never };
  };
}
