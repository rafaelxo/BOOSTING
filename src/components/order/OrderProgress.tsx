import { useQuery } from '@tanstack/react-query'
import { RankBadge } from '@/components/ui/RankBadge'
import { RankProgressionRail } from '@/components/rank/RankProgressionRail'
import { listOrderRankVerifications } from '@/api/orders'
import { queryKeys } from '@/api/core/queryKeys'
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction'
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
    </div>
  )
}

function WinBoostProgress({ order }: { order: Order }) {
  const locked = !order.match_sync_started_at
  const purchased = order.wins_purchased ?? 0
  const completed = Math.min(order.wins_played, purchased)
  const remaining = Math.max(0, purchased - order.wins_played)
  const percent = purchased > 0 ? (completed / purchased) * 100 : 0
  const done = remaining === 0
  const rank = order.current_rank as { tier: RankTier; division: Division | null } | null

  return (
    <div className="mb-4 pb-4 border-b border-border-subtle">
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

// Corte atual (PDL do último colocado) das ligas GM/Challenger na Riot --
// mesma fonte cacheada (riot_league_cutoffs) e mesmo padrão de busca de
// StepConfigure.tsx, aqui usado pra manter a trilha de progresso do pedido
// em andamento com o corte ao vivo, não só o alvo fixo mostrado na hora da
// compra.
function useLiveCutoff(queueType: Order['queue_type'], targetTier: RankTier | null, enabled: boolean) {
  const isMasterPlusTarget = targetTier === 'grandmaster' || targetTier === 'challenger'
  const { data } = useQuery({
    queryKey: ['riot-league-cutoffs', queueType],
    queryFn: () => invokeEdgeFunction<{ grandmaster_cutoff: number | null; challenger_cutoff: number | null }>('riot-league-cutoffs', {
      body: { queue: queueType },
      requireAuth: true,
    }),
    enabled: enabled && isMasterPlusTarget,
    staleTime: 5 * 60 * 1000,
  })
  if (!isMasterPlusTarget || !data) return null
  return targetTier === 'challenger' ? data.challenger_cutoff : data.grandmaster_cutoff
}

function EloBoostProgress({ order, hideRankBadges = false }: { order: Order; hideRankBadges?: boolean }) {
  const locked = !order.match_sync_started_at
  const { data: latest } = useLatestVerification(order.id, !locked)

  const initial = order.current_rank as { tier: RankTier; division: Division | null } | null
  const target = order.target_rank as { tier: RankTier; division: Division | null } | null
  const liveCutoffLp = useLiveCutoff(order.queue_type, target?.tier ?? null, !locked)
  if (!initial || !target) return null

  const current = latest?.fetched_tier
    ? { tier: latest.fetched_tier, division: latest.fetched_division }
    : initial
  const done = latest?.passed === true

  return (
    <div className="mb-4 pb-4 border-b border-border-subtle">
      {done && (
        <div className="flex justify-end mb-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-0.5 text-[11px] font-bold text-success">
            Rank alvo atingido!
          </span>
        </div>
      )}
      <RankProgressionRail
        currentTier={current.tier}
        currentDivision={current.division}
        currentLp={locked ? null : latest?.fetched_tier ? latest.fetched_lp : null}
        targetTier={target.tier}
        targetDivision={target.division}
        liveCutoffLp={locked ? null : liveCutoffLp}
        locked={locked}
        showBadges={!hideRankBadges}
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
// barra de progresso aplicável (ex.: coaching). Master+ (pdl_bracket
// preenchido) também tem progresso -- a trilha mostra o corte ao vivo em vez
// de um rank alvo fixo, então não é mais excluído aqui.
export function OrderProgress({ order, hideRankBadges = false }: { order: Order; hideRankBadges?: boolean }) {
  if (order.wins_purchased != null) return <WinBoostProgress order={order} />
  if (order.target_rank && order.current_rank) return <EloBoostProgress order={order} hideRankBadges={hideRankBadges} />
  return null
}
