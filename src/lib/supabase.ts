import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check .env.local')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Sessão vive só enquanto a aba/janela estiver aberta: sessionStorage
    // sobrevive a refresh (F5) dentro da mesma aba, mas é apagado quando a
    // plataforma é fechada — forçando novo login a cada vez que o usuário
    // fecha o navegador. O verifier PKCE do OAuth também usa este storage e
    // sobrevive ao redirect do Discord (mesma aba), então o login continua
    // funcionando. Fallback pra memória fora do browser (SSR/testes).
    storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

export const signOut = () => supabase.auth.signOut()
