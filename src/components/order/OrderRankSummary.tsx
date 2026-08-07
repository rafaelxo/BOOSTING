import { ChevronRight } from 'lucide-react'
import { RankBadge } from '@/components/ui/RankBadge'
import { formatRank } from '@/lib/utils'
import { useLatestVerification, computeEffectivePoints } from './useOrderRankProgress'
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
  const progressLocked = !order.match_sync_started_at
  // Mesmo cálculo usado pela barra (OrderProgress/useOrderRankProgress) --
  // verificação real quando existe, senão estimado por partidas
  // sincronizadas x PDL médio do pedido. Sem isso, a barra andava mas o
  // número de LP ao lado ficava parado no valor inicial do pedido.
  // Chamado incondicionalmente (regra dos hooks) mesmo antes do early
  // return abaixo -- enabled cobre o caso de currentRank ainda não existir.
  const { data: latest } = useLatestVerification(order.id, !!currentRank && !progressLocked)
  if (!currentRank) return null

  const { points: currentPoints, isEstimate } = computeEffectivePoints(order, latest)
  const pointsLabel = order.pdl_bracket ? 'PDL' : 'LP'

  const hasTarget = order.service_type === 'elo_boost' && !!targetRank

  return (
    <div className="mb-2 flex justify-center">
      <div className="flex items-center gap-6 sm:gap-10">
        <div className="flex items-center gap-3 min-w-0 shrink-0">
          <RankBadge tier={currentRank.tier} division={currentRank.division} size="lg" showLabel={false} />
          <div className="min-w-0">
            <p className="text-[11px] text-ink-muted uppercase tracking-wide">Rank Atual</p>
            <p className="text-base font-bold text-ink truncate">{formatRank(currentRank.tier, currentRank.division)}</p>
          </div>
        </div>

        {hasTarget && (
          <>
            {/* Coluna central: LP atual (ou status) empilhado sobre a
                seta -- largura fixa (não flex-1) pra não espalhar os ranks
                até as bordas de um card largo; eles ficam ancorados perto
                do meio da seção, separados só por essa coluna. */}
            <div className="w-24 sm:w-28 shrink-0 flex flex-col items-center gap-1.5">
              {order.status === 'completed' ? (
                <span className="text-sm font-bold text-success whitespace-nowrap">Rank alvo atingido!</span>
              ) : progressLocked ? (
                <span className="text-[11px] font-medium text-ink-muted whitespace-nowrap">Aguardando início</span>
              ) : (
                <span className="text-sm font-bold text-brand whitespace-nowrap" data-tabular title={isEstimate ? 'Estimativa com base nas partidas sincronizadas' : undefined}>
                  {currentPoints != null ? `${isEstimate ? '~' : ''}${currentPoints} ${pointsLabel}` : 'Sincronizando…'}
                </span>
              )}
              <div className="w-full flex items-center gap-1.5 text-border-subtle">
                <span className="h-px flex-1 bg-border-subtle" />
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
              </div>
            </div>

            <div className="flex items-center gap-2.5 min-w-0 shrink-0">
              <RankBadge tier={targetRank!.tier} division={targetRank!.division} size="lg" showLabel={false} />
              <div className="min-w-0">
                <p className="text-[11px] text-ink-muted uppercase tracking-wide">Rank Alvo</p>
                <p className="text-base font-bold text-ink truncate">{formatRank(targetRank!.tier, targetRank!.division)}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
