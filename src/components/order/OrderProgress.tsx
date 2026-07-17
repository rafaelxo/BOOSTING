import { useQuery } from '@tanstack/react-query'
import { Swords, ArrowRight } from 'lucide-react'
import { Card, RankBadge } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { formatRank } from '@/lib/utils'
import { rankStep } from '../../../shared/pricing'
import type { Order, OrderRankVerification, RankTier, Division } from '@/types'

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
    queryKey: ['order-rank-verification-latest', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_rank_verifications')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as OrderRankVerification | null
    },
    enabled,
  })
}

function EloBoostProgress({ order }: { order: Order }) {
  const { data: latest } = useLatestVerification(order.id, true)

  const initial = order.current_rank as { tier: RankTier; division: Division | null } | null
  const target = order.target_rank as { tier: RankTier; division: Division | null } | null
  if (!initial || !target) return null

  const fromStep = rankStep(initial.tier, initial.division)
  const toStep = rankStep(target.tier, target.division)
  const totalSteps = Math.max(1, toStep - fromStep)

  const currentStep = latest?.fetched_tier
    ? rankStep(latest.fetched_tier, latest.fetched_division)
    : null
  const percent = currentStep != null
    ? Math.max(0, Math.min(100, ((currentStep - fromStep) / totalSteps) * 100))
    : null
  const done = currentStep != null && currentStep >= toStep

  return (
    <Card padding="md">
      <h3 className="text-sm font-semibold text-ink mb-3">Progresso</h3>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <RankBadge tier={initial.tier} division={initial.division} size="sm" showLabel={false} />
          <ArrowRight className="h-3.5 w-3.5 text-ink-muted shrink-0" />
          <RankBadge tier={target.tier} division={target.division} size="sm" showLabel={false} />
          <span className="text-xs font-semibold text-ink-secondary">
            {formatRank(initial.tier, initial.division)} → {formatRank(target.tier, target.division)}
          </span>
        </div>
        {percent != null && <span className="font-semibold text-ink text-sm shrink-0">{percent.toFixed(0)}%</span>}
      </div>
      <ProgressBar percent={percent ?? 0} tone={done ? 'success' : 'brand'} />
      <p className="text-xs text-ink-muted mt-2">
        {done
          ? 'Rank alvo atingido!'
          : latest?.fetched_tier
            ? `Última verificação: ${formatRank(latest.fetched_tier, latest.fetched_division)}.`
            : 'Ainda sem verificação de rank registrada.'}
      </p>
    </Card>
  )
}

export function OrderProgress({ order }: { order: Order }) {
  if (order.wins_purchased != null) return <WinBoostProgress order={order} />
  if (order.target_rank && order.current_rank && !order.pdl_bracket) return <EloBoostProgress order={order} />
  return null
}
