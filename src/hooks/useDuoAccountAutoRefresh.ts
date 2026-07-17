import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction'

interface DuoAccountLike {
  id: string
  riot_id: string | null
  is_active: boolean
  reserved_by: string | null
}

type RiotRankResponse = {
  found?: boolean
  ranked?: boolean
  tier?: string
  division?: string | null
}

async function refreshRank(accountId: string, riotId: string) {
  try {
    const result = await invokeEdgeFunction<RiotRankResponse>('riot-account-rank', {
      body: { riot_id: riotId, queue: 'solo_duo' },
      requireAuth: true,
    })
    if (!result?.found || !result.ranked || !result.tier) return
    await supabase.rpc('update_duo_account_rank', {
      p_account_id: accountId,
      p_tier: result.tier,
      p_division: result.division ?? null,
    })
  } catch {
    // Refresh best-effort em segundo plano — falha silenciosa, o próximo
    // poll da lista tenta de novo (a conta continua disponível de qualquer
    // forma, só o rank exibido é que fica desatualizado até então).
  }
}

// Contas Duo usadas num pedido Duo Boost têm o rank alterado durante o
// pedido. Quando a reserva é liberada (fim do pedido — trigger
// trg_fn_release_duo_account_on_order_end, migration 056), a conta volta
// pra lista "disponível" mas current_rank fica desatualizado até alguém
// verificar manualmente. Este hook detecta a transição reservado -> livre
// entre um poll e outro (list_duo_accounts já é chamado com refetchInterval
// nas páginas que o usam) e dispara sozinho uma reconsulta na Riot.
export function useDuoAccountAutoRefresh(accounts: DuoAccountLike[] | undefined) {
  const prevReservedRef = useRef<Map<string, string | null>>(new Map())

  useEffect(() => {
    if (!accounts) return
    const prevReserved = prevReservedRef.current
    for (const account of accounts) {
      const wasReserved = prevReserved.get(account.id)
      const justReleased = wasReserved != null && account.reserved_by == null
      if (justReleased && account.is_active && account.riot_id) {
        void refreshRank(account.id, account.riot_id)
      }
      prevReserved.set(account.id, account.reserved_by)
    }
  }, [accounts])
}
