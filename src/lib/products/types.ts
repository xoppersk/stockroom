/**
 * Product-catalog database types (Phase 3).
 *
 * `src/lib/supabase/types.ts` is hand-written and only covers the Phase 0–2
 * tables (profiles, user_roles). Rather than editing that shared file while
 * other phases are in flight, this module extends it locally: `ProductsDatabase`
 * adds the catalog tables (categories, products, product_variants,
 * product_images, inventory_levels, audit_log) plus the `adjust_inventory`
 * RPC signature, and `createProductsClient()` returns a Supabase client typed
 * against the extended schema.
 *
 * Column shapes mirror `supabase/migrations/00003_catalog.sql`,
 * `00005_notifications_audit.sql` (audit_log) and `00006_inventory.sql`
 * (inventory_levels) exactly.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Database as BaseDatabase } from "@/lib/supabase/types";

export type ProductStatus = "draft" | "published" | "archived";

/* ------------------------------------------------------------------ */
/* Row types                                                           */
/* ------------------------------------------------------------------ */

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  created_at: string;
};

export type ProductRow = {
  id: string;
  title: string;
  slug: string;
  description: string;
  category_id: string | null;
  tags: string[];
  status: ProductStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductVariantRow = {
  id: string;
  product_id: string;
  title: string;
  sku: string;
  option_values: Record<string, string>;
  /** numeric(12,2) arrives from Postgres as a string. */
  price: string;
  compare_at_price: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export type ProductImageRow = {
  id: string;
  product_id: string;
  /** Bucket path inside `product-images`, or a full https:// URL (v1 media). */
  storage_path: string;
  alt_text: string;
  position: number;
  created_at: string;
};

export type InventoryLevelRow = {
  variant_id: string;
  quantity_on_hand: number;
  low_stock_threshold: number;
  updated_at: string;
};

export type AuditLogRow = {
  id: number;
  actor_id: string | null;
  action: string;
  table_name: string;
  row_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
};

/* ------------------------------------------------------------------ */
/* Insert / Update shapes                                               */
/* ------------------------------------------------------------------ */

export type CategoryInsert = {
  name: string;
  slug: string;
  parent_id?: string | null;
};
export type CategoryUpdate = Partial<CategoryInsert>;

export type ProductInsert = {
  title: string;
  slug: string;
  description?: string;
  category_id?: string | null;
  tags?: string[];
  status?: ProductStatus;
  created_by?: string | null;
};
export type ProductUpdate = Partial<Omit<ProductInsert, "created_by">>;

export type ProductVariantInsert = {
  product_id: string;
  title: string;
  sku: string;
  option_values?: Record<string, string>;
  price: number | string;
  compare_at_price?: number | string | null;
  position?: number;
};
export type ProductVariantUpdate = Partial<Omit<ProductVariantInsert, "product_id">>;

export type ProductImageInsert = {
  product_id: string;
  storage_path: string;
  alt_text?: string;
  position?: number;
};
export type ProductImageUpdate = Partial<Omit<ProductImageInsert, "product_id">>;

export type InventoryLevelUpdate = {
  quantity_on_hand?: number;
  low_stock_threshold?: number;
};

/**
 * FK relationships with literal names/targets. supabase-js resolves nested
 * selects (`product_variants(...)`) through these entries — a generic
 * `Relationship[]` can't map a relation name back to its table, so each
 * table lists its real foreign keys (Postgres default names:
 * `{table}_{column}_fkey`, per the migrations).
 */
type CategoryRelationships = [
  {
    foreignKeyName: "categories_parent_id_fkey";
    columns: ["parent_id"];
    isOneToOne: false;
    referencedRelation: "categories";
    referencedColumns: ["id"];
  },
];

type ProductRelationships = [
  {
    foreignKeyName: "products_category_id_fkey";
    columns: ["category_id"];
    isOneToOne: false;
    referencedRelation: "categories";
    referencedColumns: ["id"];
  },
  {
    foreignKeyName: "products_created_by_fkey";
    columns: ["created_by"];
    isOneToOne: false;
    referencedRelation: "profiles";
    referencedColumns: ["id"];
  },
];

type ProductVariantRelationships = [
  {
    foreignKeyName: "product_variants_product_id_fkey";
    columns: ["product_id"];
    isOneToOne: false;
    referencedRelation: "products";
    referencedColumns: ["id"];
  },
];

type ProductImageRelationships = [
  {
    foreignKeyName: "product_images_product_id_fkey";
    columns: ["product_id"];
    isOneToOne: false;
    referencedRelation: "products";
    referencedColumns: ["id"];
  },
];

type InventoryLevelRelationships = [
  {
    foreignKeyName: "inventory_levels_variant_id_fkey";
    columns: ["variant_id"];
    isOneToOne: true;
    referencedRelation: "product_variants";
    referencedColumns: ["id"];
  },
];

type AuditLogRelationships = [
  {
    foreignKeyName: "audit_log_actor_id_fkey";
    columns: ["actor_id"];
    isOneToOne: false;
    referencedRelation: "profiles";
    referencedColumns: ["id"];
  },
];

type CatalogTable<Row, Insert, Update, Relationships> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: Relationships;
};

/**
 * Base schema plus the catalog tables and the `adjust_inventory` RPC.
 *
 * `Tables` is one flat object literal (the same shape `supabase gen types`
 * emits) rather than an intersection: supabase-js requires
 * `Schema["Tables"] extends Record<string, GenericTable>`, and an
 * intersection of table maps doesn't carry the implicit index signature that
 * check needs. Base tables are referenced explicitly — if
 * `src/lib/supabase/types.ts` gains tables, add them here too.
 */
export type ProductsDatabase = {
  public: {
    Tables: {
      profiles: BaseDatabase["public"]["Tables"]["profiles"];
      user_roles: BaseDatabase["public"]["Tables"]["user_roles"];
      categories: CatalogTable<CategoryRow, CategoryInsert, CategoryUpdate, CategoryRelationships>;
      products: CatalogTable<ProductRow, ProductInsert, ProductUpdate, ProductRelationships>;
      product_variants: CatalogTable<ProductVariantRow, ProductVariantInsert, ProductVariantUpdate, ProductVariantRelationships>;
      product_images: CatalogTable<ProductImageRow, ProductImageInsert, ProductImageUpdate, ProductImageRelationships>;
      inventory_levels: CatalogTable<InventoryLevelRow, never, InventoryLevelUpdate, InventoryLevelRelationships>;
      audit_log: CatalogTable<AuditLogRow, never, never, AuditLogRelationships>;
    };
    Views: BaseDatabase["public"]["Views"];
    Functions: {
      adjust_inventory: {
        Args: {
          p_variant_id: string;
          p_delta: number;
          p_reason: string;
          p_reference: string | null;
          p_note: string | null;
        };
        Returns: number;
      };
    };
    Enums: BaseDatabase["public"]["Enums"];
    CompositeTypes: BaseDatabase["public"]["CompositeTypes"];
  };
};

/** Supabase client typed against the catalog schema. */
export async function createProductsClient(): Promise<SupabaseClient<ProductsDatabase>> {
  const client = await createClient();
  return client as unknown as SupabaseClient<ProductsDatabase>;
}

/**
 * Service-role client typed against the catalog schema.
 *
 * Used ONLY for the one write the schema's RLS design leaves without a path:
 * setting `inventory_levels.low_stock_threshold` on the rows the
 * `product_variants_create_inventory` trigger auto-creates (no direct UPDATE
 * policy exists; `adjust_inventory` only moves quantities). Throws when the
 * service-role key isn't configured — callers treat that as a graceful
 * degradation (threshold stays at the 10-unit default).
 */
export function createProductsServiceClient(): SupabaseClient<ProductsDatabase> {
  return createServiceRoleClient() as unknown as SupabaseClient<ProductsDatabase>;
}
