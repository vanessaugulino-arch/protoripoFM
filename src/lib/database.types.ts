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
      _bkp_sales_20260721: {
        Row: {
          ano: number | null
          category: string | null
          channel: string | null
          colecao: string | null
          created_at: string | null
          discount_value: number | null
          id: string | null
          installments: number | null
          mes: string | null
          payment_method: string | null
          price_realized: number | null
          quantity: number | null
          revenue_gross: number | null
          revenue_net: number | null
          revenue_net_post_tax: number | null
          sale_date: string | null
          sku: string | null
          tax_value: number | null
          temporada: string | null
          tenant_id: string | null
          type: string | null
        }
        Insert: {
          ano?: number | null
          category?: string | null
          channel?: string | null
          colecao?: string | null
          created_at?: string | null
          discount_value?: number | null
          id?: string | null
          installments?: number | null
          mes?: string | null
          payment_method?: string | null
          price_realized?: number | null
          quantity?: number | null
          revenue_gross?: number | null
          revenue_net?: number | null
          revenue_net_post_tax?: number | null
          sale_date?: string | null
          sku?: string | null
          tax_value?: number | null
          temporada?: string | null
          tenant_id?: string | null
          type?: string | null
        }
        Update: {
          ano?: number | null
          category?: string | null
          channel?: string | null
          colecao?: string | null
          created_at?: string | null
          discount_value?: number | null
          id?: string | null
          installments?: number | null
          mes?: string | null
          payment_method?: string | null
          price_realized?: number | null
          quantity?: number | null
          revenue_gross?: number | null
          revenue_net?: number | null
          revenue_net_post_tax?: number | null
          sale_date?: string | null
          sku?: string | null
          tax_value?: number | null
          temporada?: string | null
          tenant_id?: string | null
          type?: string | null
        }
        Relationships: []
      }
      annual_plan_cycles: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          applied_channel_scenario_id: string | null
          applied_division_scenario_id: string | null
          applied_month_scenario_id: string | null
          applied_sortiment_scenario_id: string | null
          created_at: string
          custom_focus_name: string | null
          detail_level: number
          field_priorities: Json
          focus: string
          id: string
          mode: string
          official_macro: Json | null
          tenant_id: string
          updated_at: string
          versions: Json
          year: number
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          applied_channel_scenario_id?: string | null
          applied_division_scenario_id?: string | null
          applied_month_scenario_id?: string | null
          applied_sortiment_scenario_id?: string | null
          created_at?: string
          custom_focus_name?: string | null
          detail_level?: number
          field_priorities?: Json
          focus: string
          id?: string
          mode?: string
          official_macro?: Json | null
          tenant_id: string
          updated_at?: string
          versions?: Json
          year: number
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          applied_channel_scenario_id?: string | null
          applied_division_scenario_id?: string | null
          applied_month_scenario_id?: string | null
          applied_sortiment_scenario_id?: string | null
          created_at?: string
          custom_focus_name?: string | null
          detail_level?: number
          field_priorities?: Json
          focus?: string
          id?: string
          mode?: string
          official_macro?: Json | null
          tenant_id?: string
          updated_at?: string
          versions?: Json
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
          {
            foreignKeyName: "apc_applied_channel_fk"
            columns: ["applied_channel_scenario_id"]
            isOneToOne: false
            referencedRelation: "channel_scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apc_applied_division_fk"
            columns: ["applied_division_scenario_id"]
            isOneToOne: false
            referencedRelation: "division_scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apc_applied_month_fk"
            columns: ["applied_month_scenario_id"]
            isOneToOne: false
            referencedRelation: "planning_scenarios"
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
      canal_regra_default: {
        Row: {
          canal_id: string
          id: string
          mes_fim: string
          mes_inicio: string
          tenant_id: string
          tipo: string
          updated_at: string
        }
        Insert: {
          canal_id: string
          id?: string
          mes_fim: string
          mes_inicio: string
          tenant_id: string
          tipo: string
          updated_at?: string
        }
        Update: {
          canal_id?: string
          id?: string
          mes_fim?: string
          mes_inicio?: string
          tenant_id?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canal_regra_default_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      canal_temporada_config: {
        Row: {
          canal_id: string
          created_at: string | null
          id: string
          mes_fim: string | null
          mes_inicio: string
          season_id: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          canal_id: string
          created_at?: string | null
          id?: string
          mes_fim?: string | null
          mes_inicio: string
          season_id: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          canal_id?: string
          created_at?: string | null
          id?: string
          mes_fim?: string | null
          mes_inicio?: string
          season_id?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "canal_temporada_config_canal_id_fkey"
            columns: ["canal_id"]
            isOneToOne: false
            referencedRelation: "sales_channels_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canal_temporada_config_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canal_temporada_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      categoria_split_producao_compra: {
        Row: {
          categoria: string
          divisao: string
          id: string
          origem: string
          pct_compra: number
          pct_producao: number
          subcategoria: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          categoria: string
          divisao: string
          id?: string
          origem?: string
          pct_compra?: number
          pct_producao?: number
          subcategoria?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          categoria?: string
          divisao?: string
          id?: string
          origem?: string
          pct_compra?: number
          pct_producao?: number
          subcategoria?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categoria_split_producao_compra_tenant_id_fkey"
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
          source_plan_version_id: string | null
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
          source_plan_version_id?: string | null
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
          source_plan_version_id?: string | null
          tenant_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "channel_scenarios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_plans: {
        Row: {
          created_by: string | null
          divisions: Json
          id: string
          is_applied: boolean
          name: string
          saved_at: string
          season_id: string
          source_division_scenario_id: string | null
          tenant_id: string
        }
        Insert: {
          created_by?: string | null
          divisions?: Json
          id?: string
          is_applied?: boolean
          name?: string
          saved_at?: string
          season_id: string
          source_division_scenario_id?: string | null
          tenant_id: string
        }
        Update: {
          created_by?: string | null
          divisions?: Json
          id?: string
          is_applied?: boolean
          name?: string
          saved_at?: string
          season_id?: string
          source_division_scenario_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_plans_source_division_fk"
            columns: ["source_division_scenario_id"]
            isOneToOne: false
            referencedRelation: "division_scenarios"
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
      color_bank: {
        Row: {
          cor_display: string
          cor_norm: string
          created_at: string | null
          familia: string
          id: string
          intensidade: string
          updated_at: string | null
        }
        Insert: {
          cor_display: string
          cor_norm: string
          created_at?: string | null
          familia: string
          id?: string
          intensidade: string
          updated_at?: string | null
        }
        Update: {
          cor_display?: string
          cor_norm?: string
          created_at?: string | null
          familia?: string
          id?: string
          intensidade?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      condicoes_pagamento: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string
          id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao: string
          id?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string
          id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "condicoes_pagamento_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      condicoes_pagamento_parcelas: {
        Row: {
          condicao_pagamento_id: string
          dias_apos_gatilho: number
          id: string
          parcela_numero: number
          percentual: number
          tipo_gatilho: string
        }
        Insert: {
          condicao_pagamento_id: string
          dias_apos_gatilho?: number
          id?: string
          parcela_numero: number
          percentual: number
          tipo_gatilho: string
        }
        Update: {
          condicao_pagamento_id?: string
          dias_apos_gatilho?: number
          id?: string
          parcela_numero?: number
          percentual?: number
          tipo_gatilho?: string
        }
        Relationships: [
          {
            foreignKeyName: "condicoes_pagamento_parcelas_condicao_pagamento_id_fkey"
            columns: ["condicao_pagamento_id"]
            isOneToOne: false
            referencedRelation: "condicoes_pagamento"
            referencedColumns: ["id"]
          },
        ]
      }
      custo_medio_hierarquia: {
        Row: {
          categoria: string
          custo_medio: number
          divisao: string
          id: string
          moeda: string
          subcategoria: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          categoria: string
          custo_medio?: number
          divisao: string
          id?: string
          moeda?: string
          subcategoria?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          categoria?: string
          custo_medio?: number
          divisao?: string
          id?: string
          moeda?: string
          subcategoria?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custo_medio_hierarquia_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      division_hierarchy_consolidated: {
        Row: {
          category: string
          division_id: string
          id: string
          linha: string
          pct_icone_marca: number | null
          pct_motor_giro: number | null
          pct_sustentador_margem: number | null
          price_tier: string
          revenue_estimate: number
          season_id: string
          subcategory: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category: string
          division_id: string
          id?: string
          linha?: string
          pct_icone_marca?: number | null
          pct_motor_giro?: number | null
          pct_sustentador_margem?: number | null
          price_tier: string
          revenue_estimate?: number
          season_id: string
          subcategory?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          division_id?: string
          id?: string
          linha?: string
          pct_icone_marca?: number | null
          pct_motor_giro?: number | null
          pct_sustentador_margem?: number | null
          price_tier?: string
          revenue_estimate?: number
          season_id?: string
          subcategory?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
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
          source_month_scenario_id: string | null
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
          source_month_scenario_id?: string | null
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
          source_month_scenario_id?: string | null
          tenant_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "division_scenarios_source_month_fk"
            columns: ["source_month_scenario_id"]
            isOneToOne: false
            referencedRelation: "planning_scenarios"
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
      fornecedores: {
        Row: {
          ativo: boolean
          codigo_erp: string | null
          contato_email: string | null
          contato_nome: string | null
          created_at: string
          id: string
          moeda_padrao: string
          nome: string
          observacoes: string | null
          pais_origem: string | null
          tenant_id: string
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo_erp?: string | null
          contato_email?: string | null
          contato_nome?: string | null
          created_at?: string
          id?: string
          moeda_padrao?: string
          nome: string
          observacoes?: string | null
          pais_origem?: string | null
          tenant_id: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo_erp?: string | null
          contato_email?: string | null
          contato_nome?: string | null
          created_at?: string
          id?: string
          moeda_padrao?: string
          nome?: string
          observacoes?: string | null
          pais_origem?: string | null
          tenant_id?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fornecedores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hierarquia_produtos: {
        Row: {
          ativo: boolean
          categoria: string
          created_at: string
          divisao: string
          id: string
          ordem: number
          subcategoria: string
          tenant_id: string
        }
        Insert: {
          ativo?: boolean
          categoria: string
          created_at?: string
          divisao: string
          id?: string
          ordem?: number
          subcategoria?: string
          tenant_id: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          created_at?: string
          divisao?: string
          id?: string
          ordem?: number
          subcategoria?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hierarquia_produtos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_snapshots: {
        Row: {
          colecao: string | null
          created_at: string
          data_ult_entrada: string | null
          id: string
          location: string | null
          mes_referencia: string | null
          quantity: number
          sku: string
          snapshot_date: string
          temporada: string | null
          tenant_id: string
          value_cost: number | null
          value_sale: number | null
        }
        Insert: {
          colecao?: string | null
          created_at?: string
          data_ult_entrada?: string | null
          id?: string
          location?: string | null
          mes_referencia?: string | null
          quantity?: number
          sku: string
          snapshot_date: string
          temporada?: string | null
          tenant_id: string
          value_cost?: number | null
          value_sale?: number | null
        }
        Update: {
          colecao?: string | null
          created_at?: string
          data_ult_entrada?: string | null
          id?: string
          location?: string | null
          mes_referencia?: string | null
          quantity?: number
          sku?: string
          snapshot_date?: string
          temporada?: string | null
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
      matriz_abastecimento: {
        Row: {
          ativo: boolean
          categoria: string
          condicao_pagamento_id: string | null
          created_at: string
          dias_producao: number
          dias_transito: number
          divisao: string
          fornecedor_id: string | null
          hierarquia_id: string | null
          id: string
          lead_time_total: number | null
          moeda: string
          observacoes: string | null
          peso_participacao: number | null
          subcategoria: string | null
          tenant_id: string
          tipo_fornecimento: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria: string
          condicao_pagamento_id?: string | null
          created_at?: string
          dias_producao?: number
          dias_transito?: number
          divisao: string
          fornecedor_id?: string | null
          hierarquia_id?: string | null
          id?: string
          lead_time_total?: number | null
          moeda?: string
          observacoes?: string | null
          peso_participacao?: number | null
          subcategoria?: string | null
          tenant_id: string
          tipo_fornecimento?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          condicao_pagamento_id?: string | null
          created_at?: string
          dias_producao?: number
          dias_transito?: number
          divisao?: string
          fornecedor_id?: string | null
          hierarquia_id?: string | null
          id?: string
          lead_time_total?: number | null
          moeda?: string
          observacoes?: string | null
          peso_participacao?: number | null
          subcategoria?: string | null
          tenant_id?: string
          tipo_fornecimento?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matriz_abastecimento_condicao_pagamento_id_fkey"
            columns: ["condicao_pagamento_id"]
            isOneToOne: false
            referencedRelation: "condicoes_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matriz_abastecimento_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matriz_abastecimento_hierarquia_id_fkey"
            columns: ["hierarquia_id"]
            isOneToOne: false
            referencedRelation: "hierarquia_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matriz_abastecimento_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matriz_producao_etapas: {
        Row: {
          condicao_pagamento_id: string | null
          created_at: string | null
          dias_prazo: number
          faccao_nome: string
          id: string
          modelo_id: string
          nome_etapa: string | null
          observacoes: string | null
          ordem_grupo: number
          tenant_id: string
        }
        Insert: {
          condicao_pagamento_id?: string | null
          created_at?: string | null
          dias_prazo?: number
          faccao_nome: string
          id?: string
          modelo_id: string
          nome_etapa?: string | null
          observacoes?: string | null
          ordem_grupo?: number
          tenant_id: string
        }
        Update: {
          condicao_pagamento_id?: string | null
          created_at?: string | null
          dias_prazo?: number
          faccao_nome?: string
          id?: string
          modelo_id?: string
          nome_etapa?: string | null
          observacoes?: string | null
          ordem_grupo?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matriz_producao_etapas_condicao_pagamento_id_fkey"
            columns: ["condicao_pagamento_id"]
            isOneToOne: false
            referencedRelation: "condicoes_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matriz_producao_etapas_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "matriz_producao_modelos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matriz_producao_etapas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matriz_producao_modelos: {
        Row: {
          ativo: boolean | null
          categoria: string
          condicao_mp_id: string | null
          created_at: string | null
          divisao: string
          id: string
          mes_corte: string | null
          nome_modelo: string
          observacoes: string | null
          pct_materia_prima: number
          subcategoria: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          categoria: string
          condicao_mp_id?: string | null
          created_at?: string | null
          divisao: string
          id?: string
          mes_corte?: string | null
          nome_modelo?: string
          observacoes?: string | null
          pct_materia_prima?: number
          subcategoria?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          categoria?: string
          condicao_mp_id?: string | null
          created_at?: string | null
          divisao?: string
          id?: string
          mes_corte?: string | null
          nome_modelo?: string
          observacoes?: string | null
          pct_materia_prima?: number
          subcategoria?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matriz_producao_modelos_condicao_mp_id_fkey"
            columns: ["condicao_mp_id"]
            isOneToOne: false
            referencedRelation: "condicoes_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matriz_producao_modelos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          faixas_categoria: Json | null
          faixas_categoria_historico: Json
          faixas_preco: Json | null
          hier_divisao_ativa: boolean
          hier_labels: Json | null
          hier_labels_pending: boolean | null
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
          faixas_categoria?: Json | null
          faixas_categoria_historico?: Json
          faixas_preco?: Json | null
          hier_divisao_ativa?: boolean
          hier_labels?: Json | null
          hier_labels_pending?: boolean | null
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
          faixas_categoria?: Json | null
          faixas_categoria_historico?: Json
          faixas_preco?: Json | null
          hier_divisao_ativa?: boolean
          hier_labels?: Json | null
          hier_labels_pending?: boolean | null
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
      plan_approval_requests: {
        Row: {
          approver_email: string | null
          created_at: string | null
          from_module: number
          id: string
          impacted_indicators: Json | null
          justification: string | null
          original_data: Json
          proposed_data: Json
          requester_email: string
          resolved_at: string | null
          resolved_by: string | null
          scenario_id: string | null
          status: string
          tenant_id: string
          to_module: number
          year: number
        }
        Insert: {
          approver_email?: string | null
          created_at?: string | null
          from_module: number
          id?: string
          impacted_indicators?: Json | null
          justification?: string | null
          original_data?: Json
          proposed_data?: Json
          requester_email: string
          resolved_at?: string | null
          resolved_by?: string | null
          scenario_id?: string | null
          status?: string
          tenant_id: string
          to_module: number
          year: number
        }
        Update: {
          approver_email?: string | null
          created_at?: string | null
          from_module?: number
          id?: string
          impacted_indicators?: Json | null
          justification?: string | null
          original_data?: Json
          proposed_data?: Json
          requester_email?: string
          resolved_at?: string | null
          resolved_by?: string | null
          scenario_id?: string | null
          status?: string
          tenant_id?: string
          to_module?: number
          year?: number
        }
        Relationships: []
      }
      plan_cascade_runs: {
        Row: {
          applied_scenario_id: string | null
          created_at: string
          error_message: string | null
          id: string
          module: number
          season_id: string | null
          status: string
          tenant_id: string
          updated_at: string
          year: number
        }
        Insert: {
          applied_scenario_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          module: number
          season_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          year: number
        }
        Update: {
          applied_scenario_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          module?: number
          season_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_cascade_runs_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_observations: {
        Row: {
          id: string
          module: string
          note: string | null
          season_key: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          module: string
          note?: string | null
          season_key: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          module?: string
          note?: string | null
          season_key?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      planning_scenarios: {
        Row: {
          created_at: string
          created_by: string | null
          cycle_id: string
          id: string
          is_applied: boolean
          name: string
          source_channel_scenario_id: string | null
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
          source_channel_scenario_id?: string | null
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
          source_channel_scenario_id?: string | null
          tenant_id?: string
          values?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "planning_scenarios_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "annual_plan_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_scenarios_source_channel_fk"
            columns: ["source_channel_scenario_id"]
            isOneToOne: false
            referencedRelation: "channel_scenarios"
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
      price_pyramid_plans: {
        Row: {
          division_id: string
          plan: Json
          season_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          division_id: string
          plan?: Json
          season_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          division_id?: string
          plan?: Json
          season_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_pyramid_plans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          color_family: string | null
          color_group: string | null
          color_intensity: string | null
          created_at: string
          data_ultima_entrada: string | null
          division: string | null
          id: string
          linha: string | null
          material: string | null
          model: string | null
          name: string
          price_cost: number | null
          price_sale: number | null
          price_tier: string | null
          production_days: number | null
          production_type: string | null
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
          color_family?: string | null
          color_group?: string | null
          color_intensity?: string | null
          created_at?: string
          data_ultima_entrada?: string | null
          division?: string | null
          id?: string
          linha?: string | null
          material?: string | null
          model?: string | null
          name: string
          price_cost?: number | null
          price_sale?: number | null
          price_tier?: string | null
          production_days?: number | null
          production_type?: string | null
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
          color_family?: string | null
          color_group?: string | null
          color_intensity?: string | null
          created_at?: string
          data_ultima_entrada?: string | null
          division?: string | null
          id?: string
          linha?: string | null
          material?: string | null
          model?: string | null
          name?: string
          price_cost?: number | null
          price_sale?: number | null
          price_tier?: string | null
          production_days?: number | null
          production_type?: string | null
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
          colecao: string | null
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
          temporada: string | null
          tenant_id: string
          type: string
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          colecao?: string | null
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
          temporada?: string | null
          tenant_id: string
          type: string
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          colecao?: string | null
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
          temporada?: string | null
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
          ano: number | null
          category: string | null
          channel: string | null
          client_code: string | null
          client_document: string | null
          client_name: string | null
          colecao: string | null
          created_at: string
          discount_value: number
          id: string
          installments: number | null
          mes: string | null
          payment_method: string | null
          price_realized: number | null
          quantity: number
          receipt_number: string | null
          revenue_gross: number
          revenue_net: number | null
          revenue_net_post_tax: number | null
          sale_date: string
          sku: string
          tax_value: number | null
          temporada: string | null
          tenant_id: string
          type: string | null
        }
        Insert: {
          ano?: number | null
          category?: string | null
          channel?: string | null
          client_code?: string | null
          client_document?: string | null
          client_name?: string | null
          colecao?: string | null
          created_at?: string
          discount_value?: number
          id?: string
          installments?: number | null
          mes?: string | null
          payment_method?: string | null
          price_realized?: number | null
          quantity?: number
          receipt_number?: string | null
          revenue_gross?: number
          revenue_net?: number | null
          revenue_net_post_tax?: number | null
          sale_date: string
          sku: string
          tax_value?: number | null
          temporada?: string | null
          tenant_id: string
          type?: string | null
        }
        Update: {
          ano?: number | null
          category?: string | null
          channel?: string | null
          client_code?: string | null
          client_document?: string | null
          client_name?: string | null
          colecao?: string | null
          created_at?: string
          discount_value?: number
          id?: string
          installments?: number | null
          mes?: string | null
          payment_method?: string | null
          price_realized?: number | null
          quantity?: number
          receipt_number?: string | null
          revenue_gross?: number
          revenue_net?: number | null
          revenue_net_post_tax?: number | null
          sale_date?: string
          sku?: string
          tax_value?: number | null
          temporada?: string | null
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
      season_default_rules: {
        Row: {
          canal_periods_unified: boolean
          id: string
          month_end: string
          month_start: string
          tenant_id: string
          tipo: string
          updated_at: string
        }
        Insert: {
          canal_periods_unified?: boolean
          id?: string
          month_end: string
          month_start: string
          tenant_id: string
          tipo: string
          updated_at?: string
        }
        Update: {
          canal_periods_unified?: boolean
          id?: string
          month_end?: string
          month_start?: string
          tenant_id?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "season_default_rules_tenant_id_fkey"
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
          auto_generated: boolean
          canal_periods_unified: boolean
          created_at: string
          fiscal_year: number | null
          id: string
          month_end: string
          month_start: string
          name: string
          tenant_id: string
          tipo: string | null
        }
        Insert: {
          auto_generated?: boolean
          canal_periods_unified?: boolean
          created_at?: string
          fiscal_year?: number | null
          id?: string
          month_end: string
          month_start: string
          name: string
          tenant_id: string
          tipo?: string | null
        }
        Update: {
          auto_generated?: boolean
          canal_periods_unified?: boolean
          created_at?: string
          fiscal_year?: number | null
          id?: string
          month_end?: string
          month_start?: string
          name?: string
          tenant_id?: string
          tipo?: string | null
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
      sortiment_category_indicators: {
        Row: {
          avg_price: number | null
          category: string
          division_id: string
          id: string
          mkd_pct: number | null
          season_id: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          avg_price?: number | null
          category: string
          division_id: string
          id?: string
          mkd_pct?: number | null
          season_id: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          avg_price?: number | null
          category?: string
          division_id?: string
          id?: string
          mkd_pct?: number | null
          season_id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      sortiment_category_notes: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          division_id: string
          id: string
          note: string
          season_id: string
          tenant_id: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          division_id: string
          id?: string
          note: string
          season_id: string
          tenant_id: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          division_id?: string
          id?: string
          note?: string
          season_id?: string
          tenant_id?: string
        }
        Relationships: []
      }
      sortiment_created_nodes: {
        Row: {
          created_at: string
          created_by: string | null
          division_id: string
          id: string
          mirror_of: string
          node_name: string
          parent_path: string
          season_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          division_id: string
          id?: string
          mirror_of: string
          node_name: string
          parent_path: string
          season_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          division_id?: string
          id?: string
          mirror_of?: string
          node_name?: string
          parent_path?: string
          season_id?: string
          tenant_id?: string
        }
        Relationships: []
      }
      sortiment_grid_adjustments: {
        Row: {
          category: string
          division_id: string
          id: string
          pct: number
          price_tier: string
          risk_level: string
          season_id: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category: string
          division_id: string
          id?: string
          pct: number
          price_tier: string
          risk_level: string
          season_id: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          division_id?: string
          id?: string
          pct?: number
          price_tier?: string
          risk_level?: string
          season_id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      sortiment_hierarchy_adjustments: {
        Row: {
          division_id: string
          id: string
          node_name: string
          parent_path: string
          pct: number
          season_id: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          division_id: string
          id?: string
          node_name: string
          parent_path: string
          pct: number
          season_id: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          division_id?: string
          id?: string
          node_name?: string
          parent_path?: string
          pct?: number
          season_id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      sortiment_plans: {
        Row: {
          created_by: string | null
          divisions: Json
          id: string
          is_applied: boolean
          name: string
          saved_at: string
          season_id: string
          source_collection_plan_id: string | null
          tenant_id: string
        }
        Insert: {
          created_by?: string | null
          divisions?: Json
          id?: string
          is_applied?: boolean
          name?: string
          saved_at?: string
          season_id: string
          source_collection_plan_id?: string | null
          tenant_id: string
        }
        Update: {
          created_by?: string | null
          divisions?: Json
          id?: string
          is_applied?: boolean
          name?: string
          saved_at?: string
          season_id?: string
          source_collection_plan_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sortiment_plans_source_collection_fk"
            columns: ["source_collection_plan_id"]
            isOneToOne: false
            referencedRelation: "collection_plans"
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
      supply_etapas_servico: {
        Row: {
          categoria: string | null
          created_at: string
          divisao: string | null
          fornecedor_id: string
          id: string
          nome_etapa: string
          prazo_etapa_dias: number
          sequencia: number
          tenant_id: string
          tipo_entrega: string
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          divisao?: string | null
          fornecedor_id: string
          id?: string
          nome_etapa: string
          prazo_etapa_dias?: number
          sequencia?: number
          tenant_id: string
          tipo_entrega?: string
        }
        Update: {
          categoria?: string | null
          created_at?: string
          divisao?: string | null
          fornecedor_id?: string
          id?: string
          nome_etapa?: string
          prazo_etapa_dias?: number
          sequencia?: number
          tenant_id?: string
          tipo_entrega?: string
        }
        Relationships: [
          {
            foreignKeyName: "supply_etapas_servico_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "supply_fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_fornecedor_categorias: {
        Row: {
          categoria: string | null
          created_at: string
          divisao: string | null
          fornecedor_id: string
          id: string
          pct_custo_medio: number
          subcategoria: string | null
          tenant_id: string
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          divisao?: string | null
          fornecedor_id: string
          id?: string
          pct_custo_medio?: number
          subcategoria?: string | null
          tenant_id: string
        }
        Update: {
          categoria?: string | null
          created_at?: string
          divisao?: string | null
          fornecedor_id?: string
          id?: string
          pct_custo_medio?: number
          subcategoria?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supply_fornecedor_categorias_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "supply_fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_fornecedores: {
        Row: {
          ativo: boolean
          codigo_erp: string | null
          created_at: string
          id: string
          nome: string
          observacoes: string | null
          origem: string | null
          pagamento_parcelas: Json
          prazo_entrega_dias: number
          tenant_id: string
          tipo_fornecedor: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo_erp?: string | null
          created_at?: string
          id?: string
          nome: string
          observacoes?: string | null
          origem?: string | null
          pagamento_parcelas?: Json
          prazo_entrega_dias?: number
          tenant_id: string
          tipo_fornecedor: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo_erp?: string | null
          created_at?: string
          id?: string
          nome?: string
          observacoes?: string | null
          origem?: string | null
          pagamento_parcelas?: Json
          prazo_entrega_dias?: number
          tenant_id?: string
          tipo_fornecedor?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supply_fornecedores_tenant_id_fkey"
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
          can_approve: boolean
          can_edit: boolean
          can_view: boolean
          id: string
          module_id: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_approve?: boolean
          can_edit?: boolean
          can_view?: boolean
          id?: string
          module_id: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_approve?: boolean
          can_edit?: boolean
          can_view?: boolean
          id?: string
          module_id?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_overrides_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
      bulk_insert_sales: { Args: { rows: Json }; Returns: number }
      classify_color: {
        Args: {
          p_cor_display: string
          p_cor_norm: string
          p_familia: string
          p_intensidade: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      get_division_giro_by_risk_level: {
        Args: {
          p_date_from: string
          p_date_to: string
          p_division: string
          p_tenant_id: string
        }
        Returns: Json
      }
      get_division_historical_tier_price: {
        Args: {
          p_date_from: string
          p_date_to: string
          p_division: string
          p_price_max: number
          p_price_min: number
          p_tenant_id: string
        }
        Returns: number
      }
      get_division_inventory_position: {
        Args: {
          p_date_from: string
          p_date_to: string
          p_division: string
          p_tenant_id: string
        }
        Returns: Json
      }
      get_division_replenishments: {
        Args: {
          p_date_from: string
          p_date_to: string
          p_division: string
          p_tenant_id: string
        }
        Returns: Json
      }
      get_hierarchy_revenue_by_path: {
        Args: { p_tenant_id: string }
        Returns: {
          category: string
          division: string
          linha: string
          risk_level: string
          subcategory: string
          total_revenue: number
        }[]
      }
      get_import_summary: {
        Args: { p_tenant_id: string }
        Returns: {
          inventory_count: number
          orders_count: number
          products_count: number
          sales_count: number
        }[]
      }
      get_plan_cascade_status: {
        Args: { p_tenant_id: string; p_year: number }
        Returns: Json
      }
      get_sales_historical_summary: {
        Args: { p_tenant_id: string }
        Returns: {
          estoque_medio_pecas: number
          markdown: number
          pmv: number
          producao: number
          receita: number
          ticket_medio: number
          year: string
        }[]
      }
      get_sales_monthly_aggregates: {
        Args: { p_tenant_id: string }
        Returns: {
          channel: string
          cost_weighted_sum: number
          discount_sum: number
          division: string
          margin_weighted_sum: number
          pmv_weighted_sum: number
          price_realized_count: number
          price_realized_sum: number
          price_sale_qty_sum: number
          quantity: number
          receipt_count: number
          revenue_net: number
          sale_month: number
          sale_year: number
        }[]
      }
      get_season_monthly_curve: {
        Args: { p_colecao: string; p_tenant: string }
        Returns: {
          month: number
          revenue: number
        }[]
      }
      get_tenant_id: { Args: never; Returns: string }
      is_super_admin: { Args: never; Returns: boolean }
      is_support_user: { Args: never; Returns: boolean }
      recompute_official_macro: {
        Args: { p_tenant: string; p_year: number }
        Returns: Json
      }
      save_faixas_categoria_with_history: {
        Args: { p_faixas: Json; p_tenant_id: string }
        Returns: undefined
      }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
