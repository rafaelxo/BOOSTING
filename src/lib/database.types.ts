// Auto-generated types from Supabase schema.
// Run: npx supabase gen types typescript --local > src/lib/database.types.ts
// For now this is a structural skeleton — replace with generated output after running migrations.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          role: 'customer' | 'booster' | 'admin' | 'support'
          username: string
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          role?: 'customer' | 'booster' | 'admin' | 'support'
          username: string
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          email?: string
          role?: 'customer' | 'booster' | 'admin' | 'support'
          username?: string
          avatar_url?: string | null
          updated_at?: string
        }
      }
      orders: {
        Row: {
          id: string
          customer_id: string
          service_id: string
          game_id: string
          status: string
          queue_type: string
          server: string
          current_rank: Json
          target_rank: Json | null
          wins_purchased: number | null
          sessions_purchased: number | null
          extras: Json
          base_price: number
          extras_price: number
          total_price: number
          estimated_hours: number | null
          customer_notes: string | null
          booster_notes: string | null
          assigned_booster_id: string | null
          stripe_payment_intent_id: string | null
          stripe_payment_status: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['orders']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['orders']['Insert']>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
