import { Trophy, XCircle, Clock, RefreshCw } from 'lucide-react'
import { Card, Skeleton, Button, ErrorAlert } from '@/components/ui'
import { cn, formatDateTime } from '@/lib/utils'
import { useOrderMatches } from '@/api/orders'

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—'
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${minutes}:${String(remaining).padStart(2, '0')}`
}

interface SyncControls {
  onSync: () => void
  syncing: boolean
  error?: string | null
  resultMessage?: string | null
}

// A janela de partidas contadas é definida pelo backend (order_matches +
// match_sync_started_at, ver migration 052) -- desde que o booster clicou em
// "Iniciar pedido" até a conclusão, nunca antes disso. Esta tela só exibe o
// que já foi sincronizado, nunca recalcula a janela no front.
export function OrderMatchHistory({ orderId, sync }: { orderId: string; sync?: SyncControls }) {
  const { data: matches, isLoading } = useOrderMatches(orderId)

  const wins = matches?.filter((m) => m.result === 'win').length ?? 0
  const losses = (matches?.length ?? 0) - wins
  const winRate = matches?.length ? Math.round((wins / matches.length) * 100) : null
  const avgKda = matches?.length
    ? matches.reduce((sum, m) => sum + (m.deaths > 0 ? (m.kills + m.assists) / m.deaths : m.kills + m.assists), 0) / matches.length
    : null

  return (
    <Card padding="md">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-ink">Histórico de partidas</h3>
        {sync && (
          <Button size="xs" variant="secondary" leftIcon={<RefreshCw className="h-3 w-3" />} loading={sync.syncing} onClick={sync.onSync}>
            Sincronizar
          </Button>
        )}
      </div>

      {sync?.error && <ErrorAlert className="mb-3" message={sync.error} />}
      {sync?.resultMessage && <p className="text-xs text-ink-muted mb-3">{sync.resultMessage}</p>}

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
        <>
          <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl bg-bg-elevated p-3 text-center" data-tabular>
            <div>
              <p className="text-sm font-bold text-ink">{wins}V / {losses}D</p>
              <p className="text-[10px] text-ink-muted mt-0.5">Resultado</p>
            </div>
            <div>
              <p className="text-sm font-bold text-ink">{winRate != null ? `${winRate}%` : '—'}</p>
              <p className="text-[10px] text-ink-muted mt-0.5">Win rate</p>
            </div>
            <div>
              <p className="text-sm font-bold text-ink">{avgKda != null ? avgKda.toFixed(2) : '—'}</p>
              <p className="text-[10px] text-ink-muted mt-0.5">KDA médio</p>
            </div>
          </div>

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
                  <p className="text-[10px] text-ink-muted" data-tabular>
                    {match.kills}/{match.deaths}/{match.assists} KDA
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="flex items-center gap-1 text-[10px] text-ink-muted justify-end" data-tabular>
                    <Clock className="h-3 w-3" /> {formatDuration(match.duration_seconds)}
                  </p>
                  <p className="text-[10px] text-ink-muted mt-0.5">{formatDateTime(match.played_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}
