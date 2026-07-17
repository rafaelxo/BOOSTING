import { useEffect } from 'react'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { RealtimePostgresChangesFilter } from '@supabase/supabase-js'

type ChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

interface RealtimeInvalidateOptions {
  /** Nome do canal -- precisa ser único por assinatura ativa na página. */
  channel: string
  table: string
  event?: ChangeEvent
  /** ex.: `order_id=eq.${orderId}` -- mesma sintaxe do Supabase Realtime. */
  filter?: string
  /** Quais query keys invalidar quando o evento chega. Sempre re-busca via
   * query normal (respeitando RLS) em vez de confiar no payload do evento --
   * mesmo padrão já usado em useNewOrderSound/booster_order_events. */
  queryKeys: QueryKey[]
  /** false para desmontar a assinatura sem desinscrever (ex.: aguardando um id). */
  enabled?: boolean
}

// Generaliza o padrão de assinatura Realtime + invalidação que já existia
// (duplicado) em useNewOrderSound e useDuoAccountAutoRefresh -- um único
// lugar cuida de subscribe/cleanup/dedupe de canal.
export function useRealtimeInvalidate({
  channel, table, event = '*', filter, queryKeys, enabled = true,
}: RealtimeInvalidateOptions) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled) return

    const config: RealtimePostgresChangesFilter<typeof event> = filter
      ? { event, schema: 'public', table, filter }
      : { event, schema: 'public', table }

    const subscription = supabase
      .channel(channel)
      .on('postgres_changes', config, () => {
        for (const key of queryKeys) void queryClient.invalidateQueries({ queryKey: key })
      })
      .subscribe()

    return () => void supabase.removeChannel(subscription)
    // queryKeys é recriado a cada render por design (chaves derivadas de
    // ids/filtros) -- serializar pra string evita reassinar o canal à toa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, table, event, filter, enabled, queryClient, JSON.stringify(queryKeys)])
}
