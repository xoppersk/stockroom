import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/lib/supabase/types";

/**
 * Storefront data layer.
 *
 * The generated `Database` type only covers the Phase 0–2 schema, so this
 * module extends it with the shop tables and RPCs from migrations
 * 00003–00009 (catalog, carts, orders, discounts, checkout/webhooks).
 * Shapes mirror `supabase/migrations/*.sql` exactly — if a migration changes,
 * update these interfaces to match.
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
}

export type ShopCartItem = {
  id: string;
  cart_id: string;
  variant_id: string;
  quantity: number;
  added_at: string;
}

export type ShopCategory = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  created_at: string;
}

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
}

export type ShopVariant = {
  id: string;
  product_id: string;
  title: string;
  sku: string;
  option_values: Json;
  price: string;
  compare_at_price: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export type ShopProductImage = {
  id: string;
  product_id: string;
  storage_path: string;
  alt_text: string;
  position: number;
  created_at: string;
}

export type ShopInventoryLevel = {
  variant_id: string;
  quantity_on_hand: number;
  low_stock_threshold: number;
  updated_at: string;
}

export type ShopOrder = {
  id: string;
  order_number: string;
  customer_id: string | null;
  status: string;
  payment_status: string;
  subtotal: string;
  discount_total: string;
  tax_total: string;
  shipping_total: string;
  total: string;
  refunded_total: string;
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
}

export type ShopOrderItem = {
  id: string;
  order_id: string;
  variant_id: string | null;
  product_title: string;
  variant_title: string;
  sku: string;
  quantity: number;
  unit_price: string;
  line_total: string;
}

export type ShopDiscount = {
  id: string;
  code: string;
  kind: string;
  value: string;
  usage_limit: number | null;
  per_customer_limit: number | null;
  min_order_value: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
}

type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
}

type TableDef<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: Relationship[];
}

/**
 * Full database type for storefront code: the generated tables plus the
 * shop tables and the checkout/webhook RPCs.
 *
 * NOTE: defined as flat object types, NOT intersections. supabase-js indexes
 * `Schema["Tables"][TableName]` with a generic key, and TS resolves an
 * indexed access into an intersection as `A[K] & B[K]` — the member missing
 * the key contributes `never`, collapsing every row type to `never`.
 */
export interface ShopDatabase {
  public: {
    Tables: {
      profiles: Database["public"]["Tables"]["profiles"];
      user_roles: Database["public"]["Tables"]["user_roles"];
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
    };
    Views: Database["public"]["Views"];
    Functions: {
      create_checkout_session: {
        Args: { p_cart_id: string; p_guest_token: string };
        Returns: string;
      };
      handle_stripe_event: {
        Args: { p_event: Json };
        Returns: null;
      };
      apply_discount_validation: {
        Args: { p_code: string; p_subtotal: number; p_customer_id: string | null };
        Returns: ShopDiscount;
      };
    };
    Enums: Database["public"]["Enums"];
    CompositeTypes: Database["public"]["CompositeTypes"];
  };
}

/**
 * Service-role client typed for the shop schema. Bypasses RLS, so every
 * query MUST scope by the guest token explicitly (see `src/lib/cart/cart.ts`).
 * Server only — never import from a Client Component.
 */
export function createShopServiceClient(): SupabaseClient<ShopDatabase> {
  return createServiceRoleClient() as unknown as SupabaseClient<ShopDatabase>;
}

/**
 * Anon client typed for the shop schema. RLS applies: published products,
 * categories, variants, and images are publicly readable. Use for
 * storefront catalog reads.
 */
export async function createShopAnonClient(): Promise<SupabaseClient<ShopDatabase>> {
  const client = await createClient();
  return client as unknown as SupabaseClient<ShopDatabase>;
}

/** Public URL for a `product-images` bucket object. */
export function productImageUrl(storagePath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/product-images/${storagePath}`;
}

/** Name of the HttpOnly cookie holding the guest cart token. */
export const CART_COOKIE = "stockroom_cart";
