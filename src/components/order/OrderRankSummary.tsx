import { ChevronRight } from 'lucide-react'
import { RankBadge } from '@/components/ui/RankBadge'
import { formatRank } from '@/lib/utils'
import type { Order } from '@/types'

// Resumo "rank atual ↔ pontos ↔ rank alvo" numa única linha -- os pontos
// (PDL pro fluxo Master+, LP pro fluxo padrão) ficam sempre centralizados
// entre os dois badges, nunca embaixo/solto em outra célula. Extraído do
// que já existia só no OrderDetail.tsx do cliente -- agora compartilhado
// com o JobDetail.tsx do booster, que antes tinha um layout próprio (pior)
// com badges e PDL espalhados em células de grid separadas.
export function OrderRankSummary({ order }: { order: Order }) {
  const currentRank = order.current_rank
  const targetRank = order.target_rank
  if (!currentRank) return null

  const progressLocked = !order.match_sync_started_at
  const currentPoints = order.pdl_bracket ? order.current_pdl : currentRank.lp
  const pointsLabel = order.pdl_bracket ? 'PDL' : 'LP'

  const hasTarget = order.service_type === 'elo_boost' && !!targetRank

  return (
    <div className="mb-2">
      <div className="flex items-center gap-4 sm:gap-8">
        <div className="flex items-center gap-3 min-w-0 shrink-0">
          <RankBadge tier={currentRank.tier} division={currentRank.division} size="lg" showLabel={false} />
          <div className="min-w-0">
            <p className="text-[11px] text-ink-muted uppercase tracking-wide">Rank Atual</p>
            <p className="text-base font-bold text-ink truncate">{formatRank(currentRank.tier, currentRank.division)}</p>
          </div>
        </div>

        {hasTarget ? (
          <div className="flex-1 min-w-[96px] flex flex-col items-center gap-1.5 px-2">
            {order.status === 'completed' ? (
              <span className="text-sm font-bold text-success whitespace-nowrap">Rank alvo atingido!</span>
            ) : progressLocked ? (
              <span className="text-[11px] font-medium text-ink-muted whitespace-nowrap">Aguardando início</span>
            ) : (
              <span className="text-sm font-bold text-brand whitespace-nowrap" data-tabular>
                {currentPoints != null ? `${currentPoints} ${pointsLabel}` : 'Sincronizando…'}
              </span>
            )}
            <div className="w-full flex items-center gap-1.5 text-border-subtle">
              <span className="h-px flex-1 bg-border-subtle" />
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
            </div>
          </div>
        ) : <div className="flex-1" />}

        {hasTarget && (
          <div className="flex items-center gap-2.5 min-w-0 shrink-0">
            <RankBadge tier={targetRank!.tier} division={targetRank!.division} size="lg" showLabel={false} />
            <div className="min-w-0">
              <p className="text-[11px] text-ink-muted uppercase tracking-wide">Rank Alvo</p>
              <p className="text-base font-bold text-ink truncate">{formatRank(targetRank!.tier, targetRank!.division)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
