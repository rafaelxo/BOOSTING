import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const HEARTBEAT_INTERVAL_MS = 60_000

/**
 * Mantém a presença do booster atualizada enquanto o painel está aberto.
 * O RPC booster_heartbeat atualiza booster_profiles.last_active_at, de onde a
 * view public_booster_profiles deriva is_available (janela de 5 minutos) —
 * é isso que faz o site público mostrar o booster como "Disponível".
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
