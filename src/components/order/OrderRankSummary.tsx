import { OrderRankRow } from './OrderRankRow'
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

  const centerContent = order.status === 'completed' ? (
    <span className="text-sm font-bold text-success whitespace-nowrap">Rank alvo atingido!</span>
  ) : currentPoints != null ? (
    <span className="text-sm font-bold text-brand whitespace-nowrap" data-tabular title={isEstimate ? 'Estimativa com base nas partidas sincronizadas' : undefined}>
      {isEstimate ? '~' : ''}{currentPoints} {pointsLabel}
    </span>
  ) : progressLocked ? (
    <span className="text-[11px] font-medium text-ink-muted whitespace-nowrap">Aguardando início</span>
  ) : (
    <span className="text-[11px] font-medium text-ink-muted whitespace-nowrap">Sincronizando…</span>
  )

  return (
    <OrderRankRow
      currentTier={currentRank.tier}
      currentDivision={currentRank.division}
      targetTier={hasTarget ? targetRank!.tier : null}
      targetDivision={hasTarget ? targetRank!.division : null}
      centerContent={centerContent}
      currentLabel={order.service_type === 'md5' ? 'Rank na Temporada Passada' : 'Rank Atual'}
    />
  )
}
