export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      annual_plan_cycles: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          created_at: string
          field_priorities: Json
          focus: string
          id: string
          mode: string
          tenant_id: string
          updated_at: string
          year: number
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          field_priorities?: Json
          focus: string
          id?: string
          mode?: string
          tenant_id: string
          updated_at?: string
          year: number
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          field_priorities?: Json
          focus?: string
          id?: string
          mode?: string
          tenant_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "annual_plan_cycles_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "annual_plan_cycles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_logs: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          id: string
          module_code: string
          note: string | null
          tenant_id: string
          year: number
        }
        Insert: {
          action: string
          created_at?: string
          created_by?: string | null
          id?: string
          module_code: string
          note?: string | null
          tenant_id: string
          year: number
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          id?: string
          module_code?: string
          note?: string | null
          tenant_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "approval_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_scenarios: {
        Row: {
          channel_data: Json
          created_by: string | null
          id: string
          is_applied: boolean
          name: string
          percents: Json
          saved_at: string
          tenant_id: string
          year: number
        }
        Insert: {
          channel_data?: Json
          created_by?: string | null
          id?: string
          is_applied?: boolean
          name: string
          percents?: Json
          saved_at?: string
          tenant_id: string
          year: number
        }
        Update: {
          channel_data?: Json
          created_by?: string | null
          id?: string
          is_applied?: boolean
          name?: string
          percents?: Json
          saved_at?: string
          tenant_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "channel_scenarios_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_scenarios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          end_date: string
          id: string
          lead_time_days: number
          name: string
          season_id: string
          start_date: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          lead_time_days?: number
          name: string
          season_id: string
          start_date: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          lead_time_days?: number
          name?: string
          season_id?: string
          start_date?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collections_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      division_scenarios: {
        Row: {
          consolidated: Json
          created_by: string | null
          description: string | null
          divisions: Json
          id: string
          is_applied: boolean
          name: string
          saved_at: string
          season_id: string
          tenant_id: string
          year: number
        }
        Insert: {
          consolidated?: Json
          created_by?: string | null
          description?: string | null
          divisions?: Json
          id?: string
          is_applied?: boolean
          name: string
          saved_at?: string
          season_id: string
          tenant_id: string
          year: number
        }
        Update: {
          consolidated?: Json
          created_by?: string | null
          description?: string | null
          divisions?: Json
          id?: string
          is_applied?: boolean
          name?: string
          saved_at?: string
          season_id?: string
          tenant_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "division_scenarios_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "division_scenarios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_snapshots: {
        Row: {
          created_at: string
          id: string
          location: string | null
          quantity: number
          sku: string
          snapshot_date: string
          tenant_id: string
          value_cost: number | null
          value_sale: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          location?: string | null
          quantity?: number
          sku: string
          snapshot_date: string
          tenant_id: string
          value_cost?: number | null
          value_sale?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          location?: string | null
          quantity?: number
          sku?: string
          snapshot_date?: string
          tenant_id?: string
          value_cost?: number | null
          value_sale?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          role_id: string | null
          tenant_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          role_id?: string | null
          tenant_id: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          role_id?: string | null
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_time_rules: {
        Row: {
          category: string
          created_at: string
          division: string | null
          id: string
          lead_time: number
          price_tier: string | null
          risk_level: string | null
          subcategory: string | null
          tenant_id: string
          type: string
          unit: string
        }
        Insert: {
          category: string
          created_at?: string
          division?: string | null
          id?: string
          lead_time: number
          price_tier?: string | null
          risk_level?: string | null
          subcategory?: string | null
          tenant_id: string
          type: string
          unit?: string
        }
        Update: {
          category?: string
          created_at?: string
          division?: string | null
          id?: string
          lead_time?: number
          price_tier?: string | null
          risk_level?: string | null
          subcategory?: string | null
          tenant_id?: string
          type?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_time_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      macro_indicators_cache: {
        Row: {
          fetched_at: string
          id: string
          indicator: string
          ref_date: string | null
          source: string | null
          unit: string | null
          value: number | null
        }
        Insert: {
          fetched_at?: string
          id?: string
          indicator: string
          ref_date?: string | null
          source?: string | null
          unit?: string | null
          value?: number | null
        }
        Update: {
          fetched_at?: string
          id?: string
          indicator?: string
          ref_date?: string | null
          source?: string | null
          unit?: string | null
          value?: number | null
        }
        Relationships: []
      }
      modules: {
        Row: {
          code: string
          created_at: string
          id: string
          level: string
          name: string
          order_index: number
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          level: string
          name: string
          order_index: number
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          level?: string
          name?: string
          order_index?: number
        }
        Relationships: []
      }
      onboarding_profiles: {
        Row: {
          completed_at: string | null
          created_at: string
          exports: boolean
          has_imported_material: boolean
          id: string
          origem_pecas: string | null
          product_hierarchy: string[]
          raw_materials: Json
          sales_channels: string[]
          segments: string[]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          exports?: boolean
          has_imported_material?: boolean
          id?: string
          origem_pecas?: string | null
          product_hierarchy?: string[]
          raw_materials?: Json
          sales_channels?: string[]
          segments?: string[]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          exports?: boolean
          has_imported_material?: boolean
          id?: string
          origem_pecas?: string | null
          product_hierarchy?: string[]
          raw_materials?: Json
          sales_channels?: string[]
          segments?: string[]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_settings: {
        Row: {
          basicos_ativos: boolean
          basicos_skus: string | null
          basicos_tipo: string | null
          hier_divisao_ativa: boolean
          hier_ordem: string
          id: string
          subcategorias: string[]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          basicos_ativos?: boolean
          basicos_skus?: string | null
          basicos_tipo?: string | null
          hier_divisao_ativa?: boolean
          hier_ordem?: string
          id?: string
          subcategorias?: string[]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          basicos_ativos?: boolean
          basicos_skus?: string | null
          basicos_tipo?: string | null
          hier_divisao_ativa?: boolean
          hier_ordem?: string
          id?: string
          subcategorias?: string[]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_matrix: {
        Row: {
          can_approve: boolean
          can_edit: boolean
          can_view: boolean
          id: string
          module_id: string
          role_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          can_approve?: boolean
          can_edit?: boolean
          can_view?: boolean
          id?: string
          module_id: string
          role_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          can_approve?: boolean
          can_edit?: boolean
          can_view?: boolean
          id?: string
          module_id?: string
          role_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_matrix_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_matrix_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_matrix_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_scenarios: {
        Row: {
          created_at: string
          created_by: string | null
          cycle_id: string
          id: string
          is_applied: boolean
          name: string
          tenant_id: string
          values: Json
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          cycle_id: string
          id?: string
          is_applied?: boolean
          name: string
          tenant_id: string
          values?: Json
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          cycle_id?: string
          id?: string
          is_applied?: boolean
          name?: string
          tenant_id?: string
          values?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "planning_scenarios_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_scenarios_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "annual_plan_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_scenarios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          features: Json
          id: string
          label: string
          max_brands: number | null
          max_users: number | null
          name: string
          price_brl: number
        }
        Insert: {
          created_at?: string
          features?: Json
          id?: string
          label: string
          max_brands?: number | null
          max_users?: number | null
          name: string
          price_brl?: number
        }
        Update: {
          created_at?: string
          features?: Json
          id?: string
          label?: string
          max_brands?: number | null
          max_users?: number | null
          name?: string
          price_brl?: number
        }
        Relationships: []
      }
      price_tiers: {
        Row: {
          category: string
          division: string | null
          id: string
          p1_max: number
          p1_min: number
          p2_max: number
          p2_min: number
          p3_max: number
          p3_min: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category: string
          division?: string | null
          id?: string
          p1_max?: number
          p1_min?: number
          p2_max?: number
          p2_min?: number
          p3_max?: number
          p3_min?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          division?: string | null
          id?: string
          p1_max?: number
          p1_min?: number
          p2_max?: number
          p2_min?: number
          p3_max?: number
          p3_min?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_tiers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_segments_master: {
        Row: {
          category: string | null
          id: string
          name: string
        }
        Insert: {
          category?: string | null
          id: string
          name: string
        }
        Update: {
          category?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          attributes: Json
          category: string | null
          collection_name: string | null
          color: string | null
          color_group: string | null
          created_at: string
          division: string | null
          id: string
          material: string | null
          model: string | null
          name: string
          price_cost: number | null
          price_sale: number | null
          price_tier: string | null
          production_days: number | null
          risk_level: string | null
          season: string | null
          sku: string
          source: string
          subcategory: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attributes?: Json
          category?: string | null
          collection_name?: string | null
          color?: string | null
          color_group?: string | null
          created_at?: string
          division?: string | null
          id?: string
          material?: string | null
          model?: string | null
          name: string
          price_cost?: number | null
          price_sale?: number | null
          price_tier?: string | null
          production_days?: number | null
          risk_level?: string | null
          season?: string | null
          sku: string
          source?: string
          subcategory?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attributes?: Json
          category?: string | null
          collection_name?: string | null
          color?: string | null
          color_group?: string | null
          created_at?: string
          division?: string | null
          id?: string
          material?: string | null
          model?: string | null
          name?: string
          price_cost?: number | null
          price_sale?: number | null
          price_tier?: string | null
          production_days?: number | null
          risk_level?: string | null
          season?: string | null
          sku?: string
          source?: string
          subcategory?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          delivery_date: string | null
          expected_delivery: string | null
          id: string
          order_date: string
          order_number: string
          quantity_delivered: number
          quantity_ordered: number
          sku: string
          status: string
          supplier: string | null
          tenant_id: string
          type: string
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_date?: string | null
          expected_delivery?: string | null
          id?: string
          order_date: string
          order_number: string
          quantity_delivered?: number
          quantity_ordered?: number
          sku: string
          status?: string
          supplier?: string | null
          tenant_id: string
          type: string
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_date?: string | null
          expected_delivery?: string | null
          id?: string
          order_date?: string
          order_number?: string
          quantity_delivered?: number
          quantity_ordered?: number
          sku?: string
          status?: string
          supplier?: string | null
          tenant_id?: string
          type?: string
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_materials_master: {
        Row: {
          category: string | null
          id: string
          name: string
        }
        Insert: {
          category?: string | null
          id: string
          name: string
        }
        Update: {
          category?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      roles: {
        Row: {
          base_level: string
          created_at: string
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          base_level: string
          created_at?: string
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          base_level?: string
          created_at?: string
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_channels_master: {
        Row: {
          id: string
          name: string
          type: string | null
        }
        Insert: {
          id: string
          name: string
          type?: string | null
        }
        Update: {
          id?: string
          name?: string
          type?: string | null
        }
        Relationships: []
      }
      sales_history: {
        Row: {
          category: string | null
          channel: string | null
          created_at: string
          discount_value: number
          id: string
          price_realized: number | null
          quantity: number
          revenue_gross: number
          revenue_net: number | null
          sale_date: string
          sku: string
          tenant_id: string
          type: string | null
        }
        Insert: {
          category?: string | null
          channel?: string | null
          created_at?: string
          discount_value?: number
          id?: string
          price_realized?: number | null
          quantity?: number
          revenue_gross?: number
          revenue_net?: number | null
          sale_date: string
          sku: string
          tenant_id: string
          type?: string | null
        }
        Update: {
          category?: string | null
          channel?: string | null
          created_at?: string
          discount_value?: number
          id?: string
          price_realized?: number | null
          quantity?: number
          revenue_gross?: number
          revenue_net?: number | null
          sale_date?: string
          sku?: string
          tenant_id?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      seasonality_curves: {
        Row: {
          collection_id: string | null
          created_at: string
          id: string
          month_index: number
          tenant_id: string
          weight_pct: number
        }
        Insert: {
          collection_id?: string | null
          created_at?: string
          id?: string
          month_index: number
          tenant_id: string
          weight_pct: number
        }
        Update: {
          collection_id?: string | null
          created_at?: string
          id?: string
          month_index?: number
          tenant_id?: string
          weight_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "seasonality_curves_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seasonality_curves_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          created_at: string
          id: string
          month_end: string
          month_start: string
          name: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          month_end: string
          month_start: string
          name: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          month_end?: string
          month_start?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seasons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      spreadsheet_imports: {
        Row: {
          column_mapping: Json
          created_at: string
          created_by: string | null
          error_detail: string | null
          file_name: string
          id: string
          mode: string
          rows_imported: number | null
          rows_skipped: number | null
          rows_total: number | null
          status: string
          tenant_id: string
        }
        Insert: {
          column_mapping?: Json
          created_at?: string
          created_by?: string | null
          error_detail?: string | null
          file_name: string
          id?: string
          mode: string
          rows_imported?: number | null
          rows_skipped?: number | null
          rows_total?: number | null
          status?: string
          tenant_id: string
        }
        Update: {
          column_mapping?: Json
          created_at?: string
          created_by?: string | null
          error_detail?: string | null
          file_name?: string
          id?: string
          mode?: string
          rows_imported?: number | null
          rows_skipped?: number | null
          rows_total?: number | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spreadsheet_imports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spreadsheet_imports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          cnpj: string | null
          created_at: string
          id: string
          name: string
          plan_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          id?: string
          name: string
          plan_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          id?: string
          name?: string
          plan_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permission_overrides: {
        Row: {
          id: string
          user_id: string
          module_id: string
          tenant_id: string
          can_view: boolean
          can_edit: boolean
          can_approve: boolean
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          module_id: string
          tenant_id: string
          can_view?: boolean
          can_edit?: boolean
          can_approve?: boolean
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          module_id?: string
          tenant_id?: string
          can_view?: boolean
          can_edit?: boolean
          can_approve?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "upo_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upo_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          role_id: string | null
          status: string
          system_role: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          role_id?: string | null
          status?: string
          system_role?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          role_id?: string | null
          status?: string
          system_role?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_states: {
        Row: {
          id: string
          module_code: string
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          year: number
        }
        Insert: {
          id?: string
          module_code: string
          status?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          year: number
        }
        Update: {
          id?: string
          module_code?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "workflow_states_module_code_fkey"
            columns: ["module_code"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "workflow_states_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_states_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_tenant_id: { Args: never; Returns: string }
      is_super_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never
