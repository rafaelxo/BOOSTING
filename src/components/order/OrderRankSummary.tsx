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

  return (
    <div className="mb-4">
      <div className="flex items-center justify-center gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <RankBadge tier={currentRank.tier} division={currentRank.division} size="lg" showLabel={false} />
          <div className="min-w-0">
            <p className="text-[11px] text-ink-muted uppercase tracking-wide">Rank Atual</p>
            <p className="text-base font-bold text-ink truncate">{formatRank(currentRank.tier, currentRank.division)}</p>
          </div>
        </div>

        {order.service_type === 'elo_boost' && targetRank && (
          <>
            <div className="flex flex-col items-center gap-1 shrink-0">
              <ChevronRight className="h-5 w-5 text-ink-muted" />
              <span className={`text-sm font-bold text-brand whitespace-nowrap ${progressLocked ? 'blur-[3px] opacity-60 select-none' : ''}`} data-tabular>
                {currentPoints ?? '—'} {pointsLabel}
              </span>
            </div>

            <div className="flex items-center gap-2.5 min-w-0">
              <RankBadge tier={targetRank.tier} division={targetRank.division} size="lg" showLabel={false} />
              <div className="min-w-0">
                <p className="text-[11px] text-ink-muted uppercase tracking-wide">Rank Alvo</p>
                <p className="text-base font-bold text-ink truncate">{formatRank(targetRank.tier, targetRank.division)}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
