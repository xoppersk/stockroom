/**
 * Database types for the auth-owned slice of the Stockroom schema.
 *
 * Covers exactly what the authentication surface reads and writes:
 *   * public.profiles   — one row per auth user (email + full_name),
 *                         reshaped by supabase/migrations/00002.
 *   * public.user_roles — one staff role per user (00002).
 *   * public.current_role() — SECURITY DEFINER role lookup (00002).
 *
 * Other tables are owned by other workers; when a full generated type file
 * lands (`supabase gen types typescript`), it can replace this file — the
 * client factories below only depend on this shape.
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
          role: string;
          granted_at: string;
          granted_by: string | null;
        };
        Insert: {
          user_id: string;
          role: string;
          granted_at?: string;
          granted_by?: string | null;
        };
        Update: {
          user_id?: string;
          role?: string;
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
    };
    Views: Record<string, never>;
    Functions: {
      current_role: {
        Args: Record<string, never>;
        Returns: string;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_staff: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
