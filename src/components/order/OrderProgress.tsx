import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { RankBadge } from '@/components/ui/RankBadge'
import { RankProgressionRail } from '@/components/rank/RankProgressionRail'
import { listOrderRankVerifications } from '@/api/orders'
import { queryKeys } from '@/api/core/queryKeys'
import { cn } from '@/lib/utils'
import type { Order, RankTier, Division } from '@/types'

function ProgressBar({ percent, tone = 'brand', locked = false }: { percent: number; tone?: 'brand' | 'success'; locked?: boolean }) {
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <div className="relative">
      <div className={cn('h-2 w-full rounded-full bg-bg-elevated overflow-hidden', locked && 'blur-[3px] opacity-60')}>
        <div
          className={`h-full rounded-full transition-all ${tone === 'success' ? 'bg-success' : 'bg-brand'}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {locked && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-5 w-5 rounded-full bg-bg-base/80 flex items-center justify-center shadow-card">
            <X className="h-3 w-3 text-ink-muted" />
          </div>
        </div>
      )}
    </div>
  )
}

function WinBoostProgress({ order }: { order: Order }) {
  const locked = order.status === 'awaiting_payment'
  const purchased = order.wins_purchased ?? 0
  const completed = Math.min(order.wins_played, purchased)
  const remaining = Math.max(0, purchased - order.wins_played)
  const percent = purchased > 0 ? (completed / purchased) * 100 : 0
  const done = remaining === 0
  const rank = order.current_rank as { tier: RankTier; division: Division | null } | null

  return (
    <div className="mb-4 pb-4 border-b border-border-subtle">
      <h3 className="text-sm font-semibold text-ink mb-3">Progresso</h3>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          {rank && <RankBadge tier={rank.tier} division={rank.division} size="xs" showLabel={false} />}
          <span className="text-sm font-bold text-ink">
            {locked ? `${purchased} vitória${purchased === 1 ? '' : 's'} contratada${purchased === 1 ? '' : 's'}` : `${remaining} vitória${remaining === 1 ? '' : 's'} restante${remaining === 1 ? '' : 's'}`}
          </span>
        </div>
        {!locked && <span className="font-semibold text-ink text-sm">{percent.toFixed(0)}%</span>}
      </div>
      <ProgressBar percent={locked ? 0 : percent} tone={done ? 'success' : 'brand'} locked={locked} />
      <p className="text-xs text-ink-muted mt-2">
        {locked
          ? 'O progresso começa a contar assim que o pagamento for confirmado.'
          : done ? 'Objetivo de vitórias atingido!' : `${completed} de ${purchased} vitórias concluídas.`}
      </p>
      {!locked && order.losses_played > 0 && (
        <p className="text-[10px] text-ink-muted mt-1">{order.losses_played} derrota{order.losses_played === 1 ? '' : 's'} no período.</p>
      )}
    </div>
  )
}

function useLatestVerification(orderId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.orders.latestRankVerification(orderId),
    queryFn: async () => (await listOrderRankVerifications(orderId, 1))[0] ?? null,
    enabled,
  })
}

function EloBoostProgress({ order }: { order: Order }) {
  const locked = order.status === 'awaiting_payment'
  const { data: latest } = useLatestVerification(order.id, !locked)

  const initial = order.current_rank as { tier: RankTier; division: Division | null } | null
  const target = order.target_rank as { tier: RankTier; division: Division | null } | null
  if (!initial || !target) return null

  const current = latest?.fetched_tier
    ? { tier: latest.fetched_tier, division: latest.fetched_division }
    : initial
  const done = latest?.passed === true

  return (
    <div className="mb-4 pb-4 border-b border-border-subtle">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-ink">Progresso</h3>
        {done && (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-0.5 text-[11px] font-bold text-success">
            Rank alvo atingido!
          </span>
        )}
      </div>
      <RankProgressionRail
        currentTier={current.tier}
        currentDivision={current.division}
        currentLp={locked ? null : latest?.fetched_tier ? latest.fetched_lp : null}
        targetTier={target.tier}
        targetDivision={target.division}
        locked={locked}
      />
      <p className="text-xs text-ink-muted mt-3">
        {locked
          ? 'O progresso começa a contar assim que o pagamento for confirmado.'
          : latest?.fetched_tier
          ? 'Verificado automaticamente via Riot API na última tentativa de conclusão.'
          : 'Ainda sem verificação de rank registrada — o booster verifica o rank ao concluir o pedido.'}
      </p>
    </div>
  )
}

// Renderiza inline dentro do card de "Detalhes do Pedido" de cada papel
// (booster/cliente/admin) -- progresso e detalhes viram uma única badge só,
// não dois cards separados. Retorna null quando o tipo de serviço não tem
// barra de progresso aplicável (ex.: coaching).
export function OrderProgress({ order }: { order: Order }) {
  if (order.wins_purchased != null) return <WinBoostProgress order={order} />
  if (order.target_rank && order.current_rank && !order.pdl_bracket) return <EloBoostProgress order={order} />
  return null
}
