import { useQuery } from '@tanstack/react-query'
import { Trophy, XCircle, Clock } from 'lucide-react'
import { Card, Skeleton } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { cn, formatDateTime } from '@/lib/utils'
import type { OrderMatch } from '@/types'

function useOrderMatches(orderId: string) {
  return useQuery({
    queryKey: ['order-matches', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_matches')
        .select('*')
        .eq('order_id', orderId)
        .order('played_at', { ascending: false })
      if (error) throw error
      return data as OrderMatch[]
    },
  })
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—'
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${minutes}:${String(remaining).padStart(2, '0')}`
}

export function OrderMatchHistory({ orderId }: { orderId: string }) {
  const { data: matches, isLoading } = useOrderMatches(orderId)

  return (
    <Card padding="md">
      <h3 className="text-sm font-semibold text-ink mb-3">Histórico de partidas</h3>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : !matches?.length ? (
        <p className="text-xs text-ink-muted py-4 text-center">
          Nenhuma partida sincronizada ainda.
        </p>
      ) : (
        <div className="space-y-2">
          {matches.map((match) => (
            <div
              key={match.id}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 border',
                match.result === 'win'
                  ? 'bg-success/5 border-success/15'
                  : 'bg-danger/5 border-danger/15',
              )}
            >
              {match.result === 'win' ? (
                <Trophy className="h-4 w-4 text-success shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-danger shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-ink truncate">
                  {match.champion ?? 'Campeão desconhecido'}
                </p>
                <p className="text-[10px] text-ink-muted">
                  {match.kills}/{match.deaths}/{match.assists} KDA
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="flex items-center gap-1 text-[10px] text-ink-muted justify-end">
                  <Clock className="h-3 w-3" /> {formatDuration(match.duration_seconds)}
                </p>
                <p className="text-[10px] text-ink-muted mt-0.5">{formatDateTime(match.played_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
