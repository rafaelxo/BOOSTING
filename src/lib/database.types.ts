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
      audit_logs: {
        Row: {
          action: string
          actor_id: string
          actor_role: Database["public"]["Enums"]["user_role"]
          created_at: string
          diff: Json | null
          entity_id: string
          entity_type: string
          id: string
          ip_address: unknown
        }
        Insert: {
          action: string
          actor_id: string
          actor_role: Database["public"]["Enums"]["user_role"]
          created_at?: string
          diff?: Json | null
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: unknown
        }
        Update: {
          action?: string
          actor_id?: string
          actor_role?: Database["public"]["Enums"]["user_role"]
          created_at?: string
          diff?: Json | null
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booster_applications: {
        Row: {
          admin_notes: string | null
          available_days: string[]
          cpf: string | null
          created_at: string
          discord_tag: string | null
          email: string | null
          full_name: string | null
          games: string[]
          has_coaching: boolean
          hours_per_week: number
          id: string
          motivation: string
          opgg_link: string | null
          peak_rank: string
          phone: string | null
          region: string
          roles: string[]
          status: string
          summoner_name: string
          updated_at: string
          user_id: string | null
          years_experience: number
        }
        Insert: {
          admin_notes?: string | null
          available_days?: string[]
          cpf?: string | null
          created_at?: string
          discord_tag?: string | null
          email?: string | null
          full_name?: string | null
          games?: string[]
          has_coaching?: boolean
          hours_per_week: number
          id?: string
          motivation: string
          opgg_link?: string | null
          peak_rank: string
          phone?: string | null
          region: string
          roles?: string[]
          status?: string
          summoner_name: string
          updated_at?: string
          user_id?: string | null
          years_experience: number
        }
        Update: {
          admin_notes?: string | null
          available_days?: string[]
          cpf?: string | null
          created_at?: string
          discord_tag?: string | null
          email?: string | null
          full_name?: string | null
          games?: string[]
          has_coaching?: boolean
          hours_per_week?: number
          id?: string
          motivation?: string
          opgg_link?: string | null
          peak_rank?: string
          phone?: string | null
          region?: string
          roles?: string[]
          status?: string
          summoner_name?: string
          updated_at?: string
          user_id?: string | null
          years_experience?: number
        }
        Relationships: [
          {
            foreignKeyName: "booster_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booster_profiles: {
        Row: {
          available_days: string[] | null
          bio: string | null
          can_coach: boolean | null
          cpf: string | null
          created_at: string
          current_rank: Json | null
          display_name: string
          email: string | null
          full_name: string | null
          games: string[]
          hours_per_day_max: number | null
          hours_per_day_min: number | null
          id: string
          is_available: boolean
          is_top5: boolean
          lanes: string[] | null
          last_active_at: string | null
          opgg_link: string | null
          peak_rank: Json | null
          queue_preferences: string[]
          rank_stats: Json | null
          rating: number
          rating_count: number
          region_preferences: string[]
          specialties: string[] | null
          status: Database["public"]["Enums"]["booster_status"]
          total_completed: number
          total_earnings: number
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          available_days?: string[] | null
          bio?: string | null
          can_coach?: boolean | null
          cpf?: string | null
          created_at?: string
          current_rank?: Json | null
          display_name: string
          email?: string | null
          full_name?: string | null
          games?: string[]
          hours_per_day_max?: number | null
          hours_per_day_min?: number | null
          id?: string
          is_available?: boolean
          is_top5?: boolean
          lanes?: string[] | null
          last_active_at?: string | null
          opgg_link?: string | null
          peak_rank?: Json | null
          queue_preferences?: string[]
          rank_stats?: Json | null
          rating?: number
          rating_count?: number
          region_preferences?: string[]
          specialties?: string[] | null
          status?: Database["public"]["Enums"]["booster_status"]
          total_completed?: number
          total_earnings?: number
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          available_days?: string[] | null
          bio?: string | null
          can_coach?: boolean | null
          cpf?: string | null
          created_at?: string
          current_rank?: Json | null
          display_name?: string
          email?: string | null
          full_name?: string | null
          games?: string[]
          hours_per_day_max?: number | null
          hours_per_day_min?: number | null
          id?: string
          is_available?: boolean
          is_top5?: boolean
          lanes?: string[] | null
          last_active_at?: string | null
          opgg_link?: string | null
          peak_rank?: Json | null
          queue_preferences?: string[]
          rank_stats?: Json | null
          rating?: number
          rating_count?: number
          region_preferences?: string[]
          specialties?: string[] | null
          status?: Database["public"]["Enums"]["booster_status"]
          total_completed?: number
          total_earnings?: number
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booster_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booster_services: {
        Row: {
          availability_note: string | null
          booster_id: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean
          price: number
          requirements: string | null
          rules: string | null
          service_type: string | null
          tempo: string | null
          title: string
          unit: string
          updated_at: string
        }
        Insert: {
          availability_note?: string | null
          booster_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          price?: number
          requirements?: string | null
          rules?: string | null
          service_type?: string | null
          tempo?: string | null
          title: string
          unit?: string
          updated_at?: string
        }
        Update: {
          availability_note?: string | null
          booster_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          price?: number
          requirements?: string | null
          rules?: string | null
          service_type?: string | null
          tempo?: string | null
          title?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booster_services_booster_id_fkey"
            columns: ["booster_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_profiles: {
        Row: {
          country: string | null
          created_at: string
          display_name: string | null
          id: string
          preferred_language: string | null
          total_orders: number
          total_spent: number
          user_id: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          preferred_language?: string | null
          total_orders?: number
          total_spent?: number
          user_id: string
        }
        Update: {
          country?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          preferred_language?: string | null
          total_orders?: number
          total_spent?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      duo_accounts: {
        Row: {
          created_at: string
          created_by: string | null
          current_rank: Json | null
          encrypted_credentials: string | null
          game_id: string
          id: string
          is_active: boolean
          label: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_rank?: Json | null
          encrypted_credentials?: string | null
          game_id?: string
          id?: string
          is_active?: boolean
          label: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_rank?: Json | null
          encrypted_credentials?: string | null
          game_id?: string
          id?: string
          is_active?: boolean
          label?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "duo_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          icon_url: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          icon_url?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          icon_url?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      master_plus_pricing: {
        Row: {
          current_tier: string
          id: string
          pdl_bracket: string
          price: number | null
          target_tier: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          current_tier: string
          id?: string
          pdl_bracket: string
          price?: number | null
          target_tier: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          current_tier?: string
          id?: string
          pdl_bracket?: string
          price?: number | null
          target_tier?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "master_plus_pricing_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          data: Json
          id: string
          is_read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          data?: Json
          id?: string
          is_read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          data?: Json
          id?: string
          is_read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_drop_requests: {
        Row: {
          admin_id: string | null
          admin_note: string | null
          booster_id: string
          created_at: string
          id: string
          losses_at_request: number
          order_id: string
          penalty_amount: number
          penalty_pct: number
          reason: string
          resolved_at: string | null
          status: string
          wins_at_request: number
        }
        Insert: {
          admin_id?: string | null
          admin_note?: string | null
          booster_id: string
          created_at?: string
          id?: string
          losses_at_request?: number
          order_id: string
          penalty_amount?: number
          penalty_pct?: number
          reason: string
          resolved_at?: string | null
          status?: string
          wins_at_request?: number
        }
        Update: {
          admin_id?: string | null
          admin_note?: string | null
          booster_id?: string
          created_at?: string
          id?: string
          losses_at_request?: number
          order_id?: string
          penalty_amount?: number
          penalty_pct?: number
          reason?: string
          resolved_at?: string | null
          status?: string
          wins_at_request?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_drop_requests_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_drop_requests_booster_id_fkey"
            columns: ["booster_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_drop_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_messages: {
        Row: {
          attachment_url: string | null
          content: string
          created_at: string
          id: string
          is_read: boolean
          order_id: string
          sender_id: string
          sender_role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          attachment_url?: string | null
          content: string
          created_at?: string
          id?: string
          is_read?: boolean
          order_id: string
          sender_id: string
          sender_role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          attachment_url?: string | null
          content?: string
          created_at?: string
          id?: string
          is_read?: boolean
          order_id?: string
          sender_id?: string
          sender_role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "order_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string
          created_at: string
          from_status: Database["public"]["Enums"]["order_status"] | null
          id: string
          order_id: string
          reason: string | null
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          changed_by: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          order_id: string
          reason?: string | null
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          changed_by?: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          order_id?: string
          reason?: string | null
          to_status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          assigned_booster_id: string | null
          avg_pdl_gain: number | null
          avg_pdl_loss: number | null
          base_price: number
          boost_mode: string
          booster_notes: string | null
          completed_at: string | null
          created_at: string
          credentials_set: boolean
          current_pdl: number | null
          current_rank: Json
          customer_id: string
          customer_notes: string | null
          discord_voice_channel_id: string | null
          estimated_hours: number | null
          extras: Json
          extras_price: number
          game_credentials: string | null
          game_id: string
          id: string
          idempotency_key: string | null
          losses_played: number
          mp_payment_id: string | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          pdl_bracket: string | null
          pricing_version: string
          queue_type: Database["public"]["Enums"]["queue_type"]
          server: string
          service_id: string
          sessions_purchased: number | null
          status: Database["public"]["Enums"]["order_status"]
          target_rank: Json | null
          total_price: number
          updated_at: string
          wins_played: number
          wins_purchased: number | null
        }
        Insert: {
          assigned_booster_id?: string | null
          avg_pdl_gain?: number | null
          avg_pdl_loss?: number | null
          base_price: number
          boost_mode?: string
          booster_notes?: string | null
          completed_at?: string | null
          created_at?: string
          credentials_set?: boolean
          current_pdl?: number | null
          current_rank: Json
          customer_id: string
          customer_notes?: string | null
          discord_voice_channel_id?: string | null
          estimated_hours?: number | null
          extras?: Json
          extras_price?: number
          game_credentials?: string | null
          game_id: string
          id?: string
          idempotency_key?: string | null
          losses_played?: number
          mp_payment_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          pdl_bracket?: string | null
          pricing_version?: string
          queue_type?: Database["public"]["Enums"]["queue_type"]
          server: string
          service_id: string
          sessions_purchased?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          target_rank?: Json | null
          total_price: number
          updated_at?: string
          wins_played?: number
          wins_purchased?: number | null
        }
        Update: {
          assigned_booster_id?: string | null
          avg_pdl_gain?: number | null
          avg_pdl_loss?: number | null
          base_price?: number
          boost_mode?: string
          booster_notes?: string | null
          completed_at?: string | null
          created_at?: string
          credentials_set?: boolean
          current_pdl?: number | null
          current_rank?: Json
          customer_id?: string
          customer_notes?: string | null
          discord_voice_channel_id?: string | null
          estimated_hours?: number | null
          extras?: Json
          extras_price?: number
          game_credentials?: string | null
          game_id?: string
          id?: string
          idempotency_key?: string | null
          losses_played?: number
          mp_payment_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          pdl_bracket?: string | null
          pricing_version?: string
          queue_type?: Database["public"]["Enums"]["queue_type"]
          server?: string
          service_id?: string
          sessions_purchased?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          target_rank?: Json | null
          total_price?: number
          updated_at?: string
          wins_played?: number
          wins_purchased?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_assigned_booster_id_fkey"
            columns: ["assigned_booster_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          customer_id: string
          id: string
          metadata: Json
          mp_payment_id: string
          order_id: string
          payment_method_type: string | null
          refunded_amount: number
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          webhook_event_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          customer_id: string
          id?: string
          metadata?: Json
          mp_payment_id: string
          order_id: string
          payment_method_type?: string | null
          refunded_amount?: number
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          webhook_event_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          customer_id?: string
          id?: string
          metadata?: Json
          mp_payment_id?: string
          order_id?: string
          payment_method_type?: string | null
          refunded_amount?: number
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          webhook_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_records: {
        Row: {
          booster_id: string
          commission_amount: number
          commission_rate: number
          created_at: string
          gross_amount: number
          id: string
          net_amount: number
          order_id: string
          paid_at: string | null
          status: Database["public"]["Enums"]["payout_status"]
        }
        Insert: {
          booster_id: string
          commission_amount: number
          commission_rate?: number
          created_at?: string
          gross_amount: number
          id?: string
          net_amount: number
          order_id: string
          paid_at?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
        }
        Update: {
          booster_id?: string
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          gross_amount?: number
          id?: string
          net_amount?: number
          order_id?: string
          paid_at?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payout_records_booster_id_fkey"
            columns: ["booster_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_records_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          discord_id: string | null
          email: string
          id: string
          legal_version: string | null
          privacy_accepted_at: string | null
          role: Database["public"]["Enums"]["user_role"]
          terms_accepted_at: string | null
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          discord_id?: string | null
          email: string
          id: string
          legal_version?: string | null
          privacy_accepted_at?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          terms_accepted_at?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          discord_id?: string | null
          email?: string
          id?: string
          legal_version?: string | null
          privacy_accepted_at?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          terms_accepted_at?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      refunds: {
        Row: {
          amount: number
          created_at: string
          id: string
          initiated_by: string
          mp_refund_id: string
          order_id: string
          payment_id: string
          reason: string
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          initiated_by: string
          mp_refund_id: string
          order_id: string
          payment_id: string
          reason: string
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          initiated_by?: string
          mp_refund_id?: string
          order_id?: string
          payment_id?: string
          reason?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          admin_note: string | null
          booster_id: string | null
          content: string | null
          created_at: string
          customer_id: string
          id: string
          is_moderated: boolean
          is_public: boolean
          order_id: string
          rating: number
        }
        Insert: {
          admin_note?: string | null
          booster_id?: string | null
          content?: string | null
          created_at?: string
          customer_id: string
          id?: string
          is_moderated?: boolean
          is_public?: boolean
          order_id: string
          rating: number
        }
        Update: {
          admin_note?: string | null
          booster_id?: string | null
          content?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          is_moderated?: boolean
          is_public?: boolean
          order_id?: string
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booster_id_fkey"
            columns: ["booster_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_extras: {
        Row: {
          code: string | null
          description: string
          flow: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          price_modifier: number
          price_modifier_pct: number
          service_id: string | null
          sort_order: number
        }
        Insert: {
          code?: string | null
          description: string
          flow?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          price_modifier?: number
          price_modifier_pct?: number
          service_id?: string | null
          sort_order?: number
        }
        Update: {
          code?: string | null
          description?: string
          flow?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price_modifier?: number
          price_modifier_pct?: number
          service_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_extras_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          description: string | null
          game_id: string
          id: string
          is_active: boolean
          name: string
          short_description: string | null
          sort_order: number
          type: Database["public"]["Enums"]["service_type"]
        }
        Insert: {
          description?: string | null
          game_id: string
          id?: string
          is_active?: boolean
          name: string
          short_description?: string | null
          sort_order?: number
          type: Database["public"]["Enums"]["service_type"]
        }
        Update: {
          description?: string | null
          game_id?: string
          id?: string
          is_active?: boolean
          name?: string
          short_description?: string | null
          sort_order?: number
          type?: Database["public"]["Enums"]["service_type"]
        }
        Relationships: [
          {
            foreignKeyName: "services_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          created_at: string
          customer_id: string
          id: string
          order_id: string | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          resolved_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          customer_id: string
          id?: string
          order_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          order_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          attachment_url: string | null
          content: string
          created_at: string
          id: string
          is_internal: boolean
          sender_id: string
          sender_role: Database["public"]["Enums"]["user_role"]
          ticket_id: string
        }
        Insert: {
          attachment_url?: string | null
          content: string
          created_at?: string
          id?: string
          is_internal?: boolean
          sender_id: string
          sender_role: Database["public"]["Enums"]["user_role"]
          ticket_id: string
        }
        Update: {
          attachment_url?: string | null
          content?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          sender_id?: string
          sender_role?: Database["public"]["Enums"]["user_role"]
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_duo_accounts: {
        Row: {
          created_at: string | null
          created_by: string | null
          current_rank: Json | null
          game_id: string | null
          id: string | null
          is_active: boolean | null
          label: string | null
          notes: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      available_boost_orders: {
        Row: {
          avg_pdl_gain: number | null
          avg_pdl_loss: number | null
          boost_mode: string | null
          created_at: string | null
          current_pdl: number | null
          current_rank: Json | null
          estimated_hours: number | null
          extras: Json | null
          game_id: string | null
          id: string | null
          losses_played: number | null
          pdl_bracket: string | null
          pricing_version: string | null
          queue_type: Database["public"]["Enums"]["queue_type"] | null
          server: string | null
          service_id: string | null
          sessions_purchased: number | null
          status: Database["public"]["Enums"]["order_status"] | null
          target_rank: Json | null
          total_price: number | null
          updated_at: string | null
          win_package: number | null
          wins_played: number | null
          wins_purchased: number | null
        }
        Relationships: []
      }
      public_booster_profiles: {
        Row: {
          bio: string | null
          current_rank: Json | null
          display_name: string | null
          games: string[] | null
          id: string | null
          is_available: boolean | null
          is_top5: boolean | null
          lanes: string[] | null
          last_active_at: string | null
          peak_rank: Json | null
          rank_stats: Json | null
          rating: number | null
          rating_count: number | null
          specialties: string[] | null
          total_completed: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          bio?: string | null
          current_rank?: Json | null
          display_name?: string | null
          games?: string[] | null
          id?: string | null
          is_available?: boolean | null
          is_top5?: boolean | null
          lanes?: string[] | null
          last_active_at?: string | null
          peak_rank?: Json | null
          rank_stats?: Json | null
          rating?: number | null
          rating_count?: number | null
          specialties?: string[] | null
          total_completed?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          bio?: string | null
          current_rank?: Json | null
          display_name?: string | null
          games?: string[] | null
          id?: string | null
          is_available?: boolean | null
          is_top5?: boolean | null
          lanes?: string[] | null
          last_active_at?: string | null
          peak_rank?: Json | null
          rank_stats?: Json | null
          rating?: number | null
          rating_count?: number | null
          specialties?: string[] | null
          total_completed?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booster_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_boost_order: {
        Args: { p_booster_user_id: string; p_order_id: string }
        Returns: Json
      }
      admin_override_order_status: {
        Args: { p_new_status: string; p_order_id: string; p_reason?: string }
        Returns: Json
      }
      approve_booster: {
        Args: { p_booster_id: string; p_new_status: string }
        Returns: Json
      }
      assign_ticket: { Args: { p_ticket_id: string }; Returns: Json }
      booster_active_slot_counts: {
        Args: { p_booster_user_id: string }
        Returns: {
          duo_count: number
          solo_count: number
          total_count: number
        }[]
      }
      can_booster_accept_order: {
        Args: { p_boost_mode: string; p_booster_user_id: string }
        Returns: Json
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      ensure_profile_exists: {
        Args: { p_display_name?: string }
        Returns: undefined
      }
      get_duo_account_credentials: {
        Args: { p_account_id: string }
        Returns: Json
      }
      get_order_credentials: { Args: { p_order_id: string }; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      log_match_result: {
        Args: { p_losses: number; p_order_id: string; p_wins: number }
        Returns: Json
      }
      moderate_review: {
        Args: { p_is_public: boolean; p_review_id: string }
        Returns: Json
      }
      onboard_booster:
        | {
            Args: {
              p_bio: string
              p_display_name: string
              p_hours_per_day_max?: number
              p_hours_per_day_min?: number
              p_opgg_link?: string
              p_peak_rank: Json
            }
            Returns: Json
          }
        | {
            Args: {
              p_bio: string
              p_cpf?: string
              p_display_name: string
              p_full_name?: string
              p_hours_per_day_max?: number
              p_hours_per_day_min?: number
              p_opgg_link?: string
              p_peak_rank: Json
            }
            Returns: Json
          }
      refresh_top5_boosters: { Args: never; Returns: undefined }
      request_booster_role: { Args: never; Returns: Json }
      request_order_drop: {
        Args: { p_order_id: string; p_reason: string }
        Returns: Json
      }
      resolve_drop_request: {
        Args: {
          p_admin_note?: string
          p_approve: boolean
          p_request_id: string
        }
        Returns: Json
      }
      set_duo_account_credentials: {
        Args: { p_account_id: string; p_login: string; p_password: string }
        Returns: Json
      }
      set_order_credentials:
        | {
            Args: { p_login: string; p_order_id: string; p_password: string }
            Returns: Json
          }
        | {
            Args: {
              p_encrypt_key?: string
              p_login: string
              p_order_id: string
              p_password: string
            }
            Returns: Json
          }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      toggle_booster_top5: {
        Args: { p_booster_id: string; p_is_top5: boolean }
        Returns: Json
      }
      update_my_username: { Args: { p_username: string }; Returns: Json }
      update_order_status: {
        Args: { p_new_status: string; p_order_id: string; p_reason?: string }
        Returns: Json
      }
    }
    Enums: {
      booster_status:
        | "pending"
        | "under_review"
        | "approved"
        | "suspended"
        | "rejected"
      game_slug: "lol" | "valorant" | "tft"
      order_status:
        | "draft"
        | "awaiting_payment"
        | "paid"
        | "awaiting_assignment"
        | "assigned"
        | "in_progress"
        | "paused"
        | "drop_requested"
        | "awaiting_customer"
        | "completed"
        | "disputed"
        | "refunded"
        | "canceled"
      payment_status:
        | "pending"
        | "paid"
        | "failed"
        | "refunded"
        | "partially_refunded"
        | "disputed"
      payout_status: "pending" | "processing" | "paid" | "failed"
      queue_type: "solo_duo" | "flex"
      service_type:
        | "elo_boost"
        | "win_boost"
        | "coaching"
        | "placement_matches"
        | "md5"
      ticket_priority: "low" | "medium" | "high" | "urgent"
      ticket_status:
        | "open"
        | "in_progress"
        | "waiting_customer"
        | "resolved"
        | "closed"
      user_role: "customer" | "booster" | "admin"
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

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      booster_status: [
        "pending",
        "under_review",
        "approved",
        "suspended",
        "rejected",
      ],
      game_slug: ["lol", "valorant", "tft"],
      order_status: [
        "draft",
        "awaiting_payment",
        "paid",
        "awaiting_assignment",
        "assigned",
        "in_progress",
        "paused",
        "drop_requested",
        "awaiting_customer",
        "completed",
        "disputed",
        "refunded",
        "canceled",
      ],
      payment_status: [
        "pending",
        "paid",
        "failed",
        "refunded",
        "partially_refunded",
        "disputed",
      ],
      payout_status: ["pending", "processing", "paid", "failed"],
      queue_type: ["solo_duo", "flex"],
      service_type: [
        "elo_boost",
        "win_boost",
        "coaching",
        "placement_matches",
        "md5",
      ],
      ticket_priority: ["low", "medium", "high", "urgent"],
      ticket_status: [
        "open",
        "in_progress",
        "waiting_customer",
        "resolved",
        "closed",
      ],
      user_role: ["customer", "booster", "admin"],
    },
  },
} as const
