import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const HEARTBEAT_INTERVAL_MS = 60_000

/**
 * Mantém booster_profiles.last_active_at atualizado enquanto o painel está
 * aberto. Alimenta apenas o "visto por último" exibido publicamente — não há
 * badge binário de status para aceitar pedidos.
 */
export function useBoosterHeartbeat() {
  useEffect(() => {
    const sendHeartbeat = () => {
      if (document.visibilityState !== 'visible') return
      void supabase.rpc('booster_heartbeat')
    }

    sendHeartbeat()
    const interval = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS)
    document.addEventListener('visibilitychange', sendHeartbeat)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', sendHeartbeat)
    }
  }, [])
}
