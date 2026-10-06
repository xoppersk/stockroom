/**
 * Hand-written database types for the Stockroom schema (Phases 0–2).
 *
 * In a real project, generate these with the Supabase CLI instead:
 *
 *   supabase gen types typescript --local > src/lib/supabase/database.types.ts
 *
 * and import that file. The shape below mirrors
 * `supabase/migrations/0000{1,2}_*.sql` exactly.
 */

/**
 * JSON value type for jsonb columns.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          user_id: string;
          role: "admin" | "warehouse" | "support";
          granted_at: string;
          granted_by: string | null;
        };
        Insert: {
          user_id: string;
          role: "admin" | "warehouse" | "support";
          granted_at?: string;
          granted_by?: string | null;
        };
        Update: {
          user_id?: string;
          role?: "admin" | "warehouse" | "support";
          granted_at?: string;
          granted_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: {
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
        Insert: {
          id?: string;
          first_name: string;
          last_name?: string;
          email?: string | null;
          phone?: string | null;
          tags?: string[];
          notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          first_name?: string;
          last_name?: string;
          email?: string | null;
          phone?: string | null;
          tags?: string[];
          notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      customer_addresses: {
        Row: {
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
        Insert: {
          id?: string;
          customer_id: string;
          label?: string;
          line1: string;
          line2?: string | null;
          city: string;
          region: string;
          postal_code: string;
          country?: string;
          is_default?: boolean;
        };
        Update: {
          id?: string;
          customer_id?: string;
          label?: string;
          line1?: string;
          line2?: string | null;
          city?: string;
          region?: string;
          postal_code?: string;
          country?: string;
          is_default?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "customer_addresses_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      discounts: {
        Row: {
          id: string;
          code: string;
          kind: "percentage" | "fixed";
          value: string;
          usage_limit: number | null;
          per_customer_limit: number | null;
          min_order_value: string;
          starts_at: string;
          ends_at: string | null;
          status: "active" | "paused";
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          kind: "percentage" | "fixed";
          value: string | number;
          usage_limit?: number | null;
          per_customer_limit?: number | null;
          min_order_value?: string | number;
          starts_at?: string;
          ends_at?: string | null;
          status?: "active" | "paused";
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          kind?: "percentage" | "fixed";
          value?: string | number;
          usage_limit?: number | null;
          per_customer_limit?: number | null;
          min_order_value?: string | number;
          starts_at?: string;
          ends_at?: string | null;
          status?: "active" | "paused";
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      discount_redemptions: {
        Row: {
          id: string;
          discount_id: string;
          order_id: string;
          customer_id: string | null;
          amount: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          discount_id: string;
          order_id: string;
          customer_id?: string | null;
          amount: string | number;
          created_at?: string;
        };
        Update: {
          id?: string;
          discount_id?: string;
          order_id?: string;
          customer_id?: string | null;
          amount?: string | number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "discount_redemptions_discount_id_fkey";
            columns: ["discount_id"];
            isOneToOne: false;
            referencedRelation: "discounts";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          id: string;
          order_number: string;
          customer_id: string | null;
          status: "pending" | "paid" | "fulfilled" | "refunded" | "cancelled" | "failed";
          payment_status: string;
          subtotal: string;
          discount_total: string;
          tax_total: string;
          shipping_total: string;
          total: string;
          refunded_total: string;
          currency: string;
          discount_code: string | null;
          shipping_address: Record<string, unknown> | null;
          tracking_number: string | null;
          source: string;
          external_id: string | null;
          guest_token: string | null;
          stripe_checkout_session_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_number?: string;
          customer_id?: string | null;
          status?:
            | "pending"
            | "paid"
            | "fulfilled"
            | "refunded"
            | "cancelled"
            | "failed";
          payment_status?: string;
          subtotal: string | number;
          discount_total?: string | number;
          tax_total?: string | number;
          shipping_total?: string | number;
          total: string | number;
          refunded_total?: string | number;
          currency?: string;
          discount_code?: string | null;
          shipping_address?: Record<string, unknown> | null;
          tracking_number?: string | null;
          source?: string;
          external_id?: string | null;
          guest_token?: string | null;
          stripe_checkout_session_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_number?: string;
          customer_id?: string | null;
          status?:
            | "pending"
            | "paid"
            | "fulfilled"
            | "refunded"
            | "cancelled"
            | "failed";
          payment_status?: string;
          subtotal?: string | number;
          discount_total?: string | number;
          tax_total?: string | number;
          shipping_total?: string | number;
          total?: string | number;
          refunded_total?: string | number;
          currency?: string;
          discount_code?: string | null;
          shipping_address?: Record<string, unknown> | null;
          tracking_number?: string | null;
          source?: string;
          external_id?: string | null;
          guest_token?: string | null;
          stripe_checkout_session_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          id: string;
          title: string;
          slug: string;
          description: string;
          category_id: string | null;
          tags: string[];
          status: "draft" | "published" | "archived";
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          slug: string;
          description?: string;
          category_id?: string | null;
          tags?: string[];
          status?: "draft" | "published" | "archived";
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          slug?: string;
          description?: string;
          category_id?: string | null;
          tags?: string[];
          status?: "draft" | "published" | "archived";
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          parent_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          parent_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          parent_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      product_variants: {
        Row: {
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
        };
        Insert: {
          id?: string;
          product_id: string;
          title: string;
          sku: string;
          option_values?: Json;
          price: string | number;
          compare_at_price?: string | number | null;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          title?: string;
          sku?: string;
          option_values?: Json;
          price?: string | number;
          compare_at_price?: string | number | null;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_images: {
        Row: {
          id: string;
          product_id: string;
          storage_path: string;
          alt_text: string;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          storage_path: string;
          alt_text?: string;
          position?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          storage_path?: string;
          alt_text?: string;
          position?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_levels: {
        Row: {
          variant_id: string;
          quantity_on_hand: number;
          low_stock_threshold: number;
          updated_at: string;
        };
        Insert: {
          variant_id: string;
          quantity_on_hand?: number;
          low_stock_threshold?: number;
          updated_at?: string;
        };
        Update: {
          variant_id?: string;
          quantity_on_hand?: number;
          low_stock_threshold?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_levels_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: true;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_adjustments: {
        Row: {
          id: string;
          variant_id: string;
          delta: number;
          quantity_before: number;
          quantity_after: number;
          reason:
            | "sale"
            | "restock_received"
            | "damaged"
            | "recount"
            | "return"
            | "cancelled_order"
            | "manual";
          reference: string | null;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          variant_id: string;
          delta: number;
          quantity_before: number;
          quantity_after: number;
          reason:
            | "sale"
            | "restock_received"
            | "damaged"
            | "recount"
            | "return"
            | "cancelled_order"
            | "manual";
          reference?: string | null;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          variant_id?: string;
          delta?: number;
          quantity_before?: number;
          quantity_after?: number;
          reason?:
            | "sale"
            | "restock_received"
            | "damaged"
            | "recount"
            | "return"
            | "cancelled_order"
            | "manual";
          reference?: string | null;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_adjustments_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          variant_id: string | null;
          product_title: string;
          variant_title: string;
          sku: string;
          quantity: number;
          unit_price: string;
          line_total: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          variant_id?: string | null;
          product_title: string;
          variant_title: string;
          sku: string;
          quantity: number;
          unit_price: string | number;
          line_total: string | number;
        };
        Update: {
          id?: string;
          order_id?: string;
          variant_id?: string | null;
          product_title?: string;
          variant_title?: string;
          sku?: string;
          quantity?: number;
          unit_price?: string | number;
          line_total?: string | number;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      order_events: {
        Row: {
          id: string;
          order_id: string;
          event_type:
            | "created"
            | "checkout_started"
            | "payment_succeeded"
            | "payment_failed"
            | "paid"
            | "fulfilled"
            | "refund_issued"
            | "cancelled"
            | "note_added"
            | "tracking_added";
          message: string;
          metadata: Json | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          event_type:
            | "created"
            | "checkout_started"
            | "payment_succeeded"
            | "payment_failed"
            | "paid"
            | "fulfilled"
            | "refund_issued"
            | "cancelled"
            | "note_added"
            | "tracking_added";
          message: string;
          metadata?: Json | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          event_type?:
            | "created"
            | "checkout_started"
            | "payment_succeeded"
            | "payment_failed"
            | "paid"
            | "fulfilled"
            | "refund_issued"
            | "cancelled"
            | "note_added"
            | "tracking_added";
          message?: string;
          metadata?: Json | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          id: string;
          order_id: string;
          stripe_payment_intent_id: string;
          stripe_checkout_session_id: string | null;
          amount: string;
          currency: string;
          status:
            | "pending"
            | "requires_action"
            | "succeeded"
            | "failed"
            | "refunded"
            | "partially_refunded"
            | "cancelled";
          idempotency_key: string;
          failure_message: string | null;
          raw_payload: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          stripe_payment_intent_id: string;
          stripe_checkout_session_id?: string | null;
          amount: string | number;
          currency?: string;
          status?:
            | "pending"
            | "requires_action"
            | "succeeded"
            | "failed"
            | "refunded"
            | "partially_refunded"
            | "cancelled";
          idempotency_key: string;
          failure_message?: string | null;
          raw_payload?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          stripe_payment_intent_id?: string;
          stripe_checkout_session_id?: string | null;
          amount?: string | number;
          currency?: string;
          status?:
            | "pending"
            | "requires_action"
            | "succeeded"
            | "failed"
            | "refunded"
            | "partially_refunded"
            | "cancelled";
          idempotency_key?: string;
          failure_message?: string | null;
          raw_payload?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string | null;
          kind: "new_order" | "low_stock" | "refund_issued" | "order_cancelled";
          title: string;
          body: string;
          link: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          kind: "new_order" | "low_stock" | "refund_issued" | "order_cancelled";
          title: string;
          body?: string;
          link?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          kind?: "new_order" | "low_stock" | "refund_issued" | "order_cancelled";
          title?: string;
          body?: string;
          link?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: number;
          actor_id: string | null;
          action: string;
          table_name: string;
          row_id: string;
          before: Json | null;
          after: Json | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          actor_id?: string | null;
          action: string;
          table_name: string;
          row_id: string;
          before?: Json | null;
          after?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          actor_id?: string | null;
          action?: string;
          table_name?: string;
          row_id?: string;
          before?: Json | null;
          after?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      carts: {
        Row: {
          id: string;
          guest_token: string;
          user_id: string | null;
          discount_code: string | null;
          expires_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          guest_token?: string;
          user_id?: string | null;
          discount_code?: string | null;
          expires_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          guest_token?: string;
          user_id?: string | null;
          discount_code?: string | null;
          expires_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      cart_items: {
        Row: {
          id: string;
          cart_id: string;
          variant_id: string;
          quantity: number;
          added_at: string;
        };
        Insert: {
          id?: string;
          cart_id: string;
          variant_id: string;
          quantity: number;
          added_at?: string;
        };
        Update: {
          id?: string;
          cart_id?: string;
          variant_id?: string;
          quantity?: number;
          added_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey";
            columns: ["cart_id"];
            isOneToOne: false;
            referencedRelation: "carts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      apply_discount_validation: {
        Args: { p_code: string; p_subtotal: number; p_customer_id?: string | null };
        Returns: {
          id: string;
          code: string;
          kind: "percentage" | "fixed";
          value: string;
          usage_limit: number | null;
          per_customer_limit: number | null;
          min_order_value: string;
          starts_at: string;
          ends_at: string | null;
          status: "active" | "paused";
          created_by: string | null;
          created_at: string;
        };
      };
      create_order_with_items: {
        Args: {
          p_customer_id: string;
          p_items: Json;
          p_discount_code?: string | null;
          p_shipping_address?: Json | null;
          p_source?: string | null;
          p_note?: string | null;
        };
        Returns: string;
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
      _adjust_inventory: {
        Args: {
          p_variant_id: string;
          p_delta: number;
          p_reason: string;
          p_reference?: string | null;
          p_note?: string | null;
          p_actor?: string | null;
        };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
