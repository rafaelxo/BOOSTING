import { useQuery } from '@tanstack/react-query'
import { Swords } from 'lucide-react'
import { Card } from '@/components/ui'
import { RankProgressionRail } from '@/components/rank/RankProgressionRail'
import { listOrderRankVerifications } from '@/api/orders'
import type { Order, RankTier, Division } from '@/types'

function ProgressBar({ percent, tone = 'brand' }: { percent: number; tone?: 'brand' | 'success' }) {
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <div className="h-2 w-full rounded-full bg-bg-elevated overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${tone === 'success' ? 'bg-success' : 'bg-brand'}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

function WinBoostProgress({ order }: { order: Order }) {
  const purchased = order.wins_purchased ?? 0
  const completed = Math.min(order.wins_played, purchased)
  const remaining = Math.max(0, purchased - order.wins_played)
  const percent = purchased > 0 ? (completed / purchased) * 100 : 0
  const done = remaining === 0

  return (
    <Card padding="md">
      <h3 className="text-sm font-semibold text-ink mb-3">Progresso</h3>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
            <Swords className="h-4 w-4 text-brand" />
          </div>
          <span className="text-sm font-bold text-ink">{remaining} vitória{remaining === 1 ? '' : 's'} restante{remaining === 1 ? '' : 's'}</span>
        </div>
        <span className="font-semibold text-ink text-sm">{percent.toFixed(0)}%</span>
      </div>
      <ProgressBar percent={percent} tone={done ? 'success' : 'brand'} />
      <p className="text-xs text-ink-muted mt-2">
        {done ? 'Objetivo de vitórias atingido!' : `${completed} de ${purchased} vitórias concluídas.`}
      </p>
      {order.losses_played > 0 && (
        <p className="text-[10px] text-ink-muted mt-1">{order.losses_played} derrota{order.losses_played === 1 ? '' : 's'} no período.</p>
      )}
    </Card>
  )
}

function useLatestVerification(orderId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['orders', 'detail', orderId, 'rank-verifications', 'latest'],
    queryFn: async () => (await listOrderRankVerifications(orderId, 1))[0] ?? null,
    enabled,
  })
}

function EloBoostProgress({ order }: { order: Order }) {
  const { data: latest } = useLatestVerification(order.id, true)

  const initial = order.current_rank as { tier: RankTier; division: Division | null } | null
  const target = order.target_rank as { tier: RankTier; division: Division | null } | null
  if (!initial || !target) return null

  const current = latest?.fetched_tier
    ? { tier: latest.fetched_tier, division: latest.fetched_division }
    : initial
  const done = latest?.passed === true

  return (
    <Card padding="md">
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
        targetTier={target.tier}
        targetDivision={target.division}
      />
      <p className="text-xs text-ink-muted mt-3">
        {latest?.fetched_tier
          ? 'Verificado automaticamente via Riot API na última tentativa de conclusão.'
          : 'Ainda sem verificação de rank registrada — o booster verifica o rank ao concluir o pedido.'}
      </p>
    </Card>
  )
}

export function OrderProgress({ order }: { order: Order }) {
  if (order.wins_purchased != null) return <WinBoostProgress order={order} />
  if (order.target_rank && order.current_rank && !order.pdl_bracket) return <EloBoostProgress order={order} />
  return null
}
