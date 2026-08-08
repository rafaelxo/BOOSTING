import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Briefcase, History, Lock, Sparkles, Swords, Users, TrendingUp, Zap } from 'lucide-react'
import { Button, Card, EmptyState, Skeleton, RankBadge } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { timeAgo, formatRank, boosterEarningsShare, getServiceLabel, getOrderModeType, sortOrderExtras } from '@/lib/utils'
import { CLASH_TIER_LABEL, CLASH_DAY_LABEL } from '@/lib/clashDomain'
import type { ClashDay, ClashTier, Division, Order, QueueType, RankTier, ServiceType } from '@/types'
import { useTranslation } from 'react-i18next'
import { useCurrency } from '@/hooks/useCurrency'
import { useAvailableJobs, useBoosterSlotInfo, useAcceptBoostOrder } from '@/api/orders'
import { OrderSoundSettings } from '@/features/booster/components/OrderSoundSettings'

// Categoria de filtro por tipo de serviço — agrupa 'win_boost'/'md5'/
// 'placement_matches' (legado) num único balde "Vitórias / MD5", espelhando
// o agrupamento já usado em StepService.tsx (o cliente também só escolhe
// entre essas 4 categorias, nunca md5/win_boost como opções separadas).
type JobCategory = 'all' | 'elo_boost' | 'win_boost' | 'clash' | 'coaching'

const SERVICE_CATEGORIES: { value: JobCategory; label: string; icon: React.ElementType }[] = [
  { value: 'all', label: 'Todos', icon: Briefcase },
  { value: 'elo_boost', label: 'Elo Boost', icon: TrendingUp },
  { value: 'win_boost', label: 'Vitórias / MD5', icon: Zap },
  { value: 'clash', label: 'Clash', icon: Swords },
  { value: 'coaching', label: 'Coaching', icon: Users },
]

function jobCategory(serviceType: ServiceType | null): JobCategory {
  if (serviceType === 'elo_boost') return 'elo_boost'
  if (serviceType === 'win_boost' || serviceType === 'md5' || serviceType === 'placement_matches') return 'win_boost'
  if (serviceType === 'clash') return 'clash'
  if (serviceType === 'coaching') return 'coaching'
  return 'all'
}

const CLASH_TIERS: ClashTier[] = ['tier_4', 'tier_3', 'tier_2', 'tier_1']
const CLASH_DAYS: ClashDay[] = ['saturday', 'sunday']


interface SlotInfo {
  solo_count: number
  duo_count: number
  total_count: number
  max_total: number
  is_top3: boolean
  exclusive_slot_used: boolean
  max_exclusive: number
}

function SlotIndicator({ slots }: { slots: SlotInfo }) {
  const { solo_count, duo_count, total_count, max_total, is_top3, exclusive_slot_used } = slots
  const remaining = max_total - total_count
  const color = remaining === 0 ? 'text-danger' : remaining === 1 ? 'text-warning' : 'text-success'

  return (
    <div className="flex items-center gap-3 bg-bg-surface/80 backdrop-blur-sm border border-bg-elevated rounded-xl px-4 py-2.5">
      {is_top3 && (
        <span className="text-[10px] font-bold bg-warning/10 text-warning border border-warning/20 rounded-lg px-2 py-0.5 uppercase tracking-wide">
          TOP 3
        </span>
      )}
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-ink-muted">Slots:</span>
        <span className={`font-bold ${color}`}>{total_count}/{max_total}</span>
      </div>
      <div className="h-3 w-px bg-bg-elevated" />
      <div className="flex items-center gap-2 text-[11px] text-ink-secondary">
        <span className="flex items-center gap-1">
          <Swords className="h-3 w-3" />
          Solo: {solo_count}
        </span>
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          Duo: {duo_count}
        </span>
      </div>
      <div className="h-3 w-px bg-bg-elevated" />
      <span className={`flex items-center gap-1 text-[11px] font-medium ${exclusive_slot_used ? 'text-ink-muted' : 'text-accent'}`}>
        <Sparkles className="h-3 w-3" />
        Exclusivo: {exclusive_slot_used ? 1 : 0}/1
      </span>
    </div>
  )
}

// Só o booster para quem o pedido foi vinculado vê o rótulo — para todos os
// outros o pedido simplesmente não aparece (filtrado no available_boost_orders).
function exclusiveTimeLeft(job: Order, myUserId?: string): string | null {
  if (!myUserId || job.preferred_booster_id !== myUserId || !job.exclusive_until) return null
  const msLeft = new Date(job.exclusive_until).getTime() - Date.now()
  if (msLeft <= 0) return null
  const hours = Math.floor(msLeft / 3_600_000)
  const minutes = Math.floor((msLeft % 3_600_000) / 60_000)
  return hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`
}

export function AvailableJobsPage() {
  const { profile } = useAuthStore()
  const [category, setCategory] = useState<JobCategory>('all')
  const [queue, setQueue] = useState<QueueType | 'all'>('all')
  const [clashTierFilter, setClashTierFilter] = useState<ClashTier | 'all'>('all')
  const [clashDayFilter, setClashDayFilter] = useState<ClashDay | 'all'>('all')
  const { t } = useTranslation()
  const currency = useCurrency()

  // Trocar de categoria zera os filtros de subtipo da categoria anterior —
  // um filtro de fila escolhido em Elo Boost não deve sobreviver ao trocar
  // pra Clash (onde fila nem existe) e voltar.
  function handleCategoryChange(next: JobCategory) {
    setCategory(next)
    setQueue('all')
    setClashTierFilter('all')
    setClashDayFilter('all')
  }

  const QUEUE_OPTIONS: { label: string; value: QueueType | 'all' }[] = [
    { label: 'Todas as Filas', value: 'all' },
    { label: t('booster.jobs.soloQueue'), value: 'solo_duo' },
    { label: t('booster.jobs.flexQueue'), value: 'flex' },
  ]

  const { data: boosterProfile } = useQuery({
    queryKey: ['booster-profile-slots', profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('booster_profiles')
        .select('status, is_top3, user_id')
        .eq('user_id', profile!.id)
        .maybeSingle()
      return data
    },
    enabled: !!profile?.id,
  })

  // Real-time slot counts via DB function
  const { data: slotInfoRaw } = useBoosterSlotInfo(profile?.id, boosterProfile?.status === 'approved')
  const slotInfo: SlotInfo | undefined = slotInfoRaw ? {
    solo_count: slotInfoRaw.solo_count ?? 0,
    duo_count: slotInfoRaw.duo_count ?? 0,
    total_count: slotInfoRaw.total_count ?? 0,
    max_total: slotInfoRaw.max_total ?? 3,
    is_top3: slotInfoRaw.is_top3 ?? false,
    exclusive_slot_used: slotInfoRaw.exclusive_slot_used ?? false,
    max_exclusive: slotInfoRaw.max_exclusive ?? 1,
  } : undefined

  const { data: jobs, isLoading } = useAvailableJobs()

  // Mensagens de erro já vêm traduzidas de src/api/orders/mutations.ts (ACCEPT_ORDER_MESSAGES).
  const acceptJobMutation = useAcceptBoostOrder()
  const acceptJob = {
    isPending: acceptJobMutation.isPending,
    isError: acceptJobMutation.isError,
    error: acceptJobMutation.error,
    mutate: (orderId: string) => acceptJobMutation.mutate({ orderId, boosterId: profile!.id }),
  }

  const canAcceptJob = (job: Order): boolean => {
    if (!slotInfo) return false
    // Pedido exclusivo pra mim, ainda dentro da janela: usa o slot bônus
    // (máx 1), independente dos 3 slots normais estarem cheios ou não.
    if (exclusiveTimeLeft(job, profile?.id)) return !slotInfo.exclusive_slot_used
    if (slotInfo.total_count >= slotInfo.max_total) return false
    return true
  }

  const categoryCounts = (jobs ?? []).reduce<Record<JobCategory, number>>((acc, j) => {
    const c = jobCategory(j.service_type)
    acc[c] = (acc[c] ?? 0) + 1
    return acc
  }, { all: jobs?.length ?? 0, elo_boost: 0, win_boost: 0, clash: 0, coaching: 0 })

  const filtered = jobs?.filter((j) => {
    if (category !== 'all' && jobCategory(j.service_type) !== category) return false
    if ((category === 'elo_boost' || category === 'win_boost') && queue !== 'all' && j.queue_type !== queue) return false
    if (category === 'clash') {
      if (clashTierFilter !== 'all' && j.clash_tier !== clashTierFilter) return false
      if (clashDayFilter !== 'all' && j.clash_day !== clashDayFilter) return false
    }
    return true
  }) ?? []

  if (boosterProfile && boosterProfile.status !== 'approved') {
    const statusMessages: Record<string, { title: string; desc: string }> = {
      pending:      { title: t('booster.jobs.locked.pending'), desc: t('booster.jobs.locked.pendingDesc') },
      under_review: { title: t('booster.jobs.locked.under_review'), desc: t('booster.jobs.locked.under_reviewDesc') },
      suspended:    { title: t('booster.jobs.locked.suspended'), desc: t('booster.jobs.locked.suspendedDesc') },
    }
    const msg = statusMessages[boosterProfile.status] ?? { title: t('booster.jobs.locked.default'), desc: t('booster.jobs.locked.defaultDesc') }
    return (
      <div>
        <EmptyState icon={Lock} title={msg.title} description={msg.desc} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t('booster.jobs.title')}</h1>
          <p className="text-sm text-ink-secondary mt-1">
            {t('booster.jobs.count', { count: filtered.length })}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {slotInfo && <SlotIndicator slots={slotInfo} />}
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-slow" />
            {t('booster.jobs.live')}
          </div>
          <OrderSoundSettings />
        </div>
      </div>

      {/* Slots full warning */}
      {slotInfo && slotInfo.total_count >= slotInfo.max_total && (
        <div className="bg-warning/10 border border-warning/20 rounded-xl px-4 py-3 text-sm text-warning font-medium">
          Você atingiu o limite de {slotInfo.max_total} pedidos ativos. Conclua um pedido para liberar um slot.
          {!slotInfo.exclusive_slot_used && ' Você ainda pode aceitar 1 pedido exclusivo, se algum estiver vinculado a você.'}
        </div>
      )}

      {/* Filters — tipo de serviço, com subtipos específicos de cada um abaixo */}
      <div className="space-y-3">
        <div className="flex gap-1 bg-bg-surface/80 backdrop-blur-sm border border-bg-elevated rounded-xl p-1 flex-wrap">
          {SERVICE_CATEGORIES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => handleCategoryChange(value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                category === value ? 'bg-brand text-white' : 'text-ink-secondary hover:text-ink'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              <span className={`text-[10px] ${category === value ? 'text-white/80' : 'text-ink-muted'}`}>
                {categoryCounts[value]}
              </span>
            </button>
          ))}
        </div>

        {(category === 'elo_boost' || category === 'win_boost') && (
          <div className="flex gap-1 bg-bg-surface/80 backdrop-blur-sm border border-bg-elevated rounded-xl p-1 w-fit">
            {QUEUE_OPTIONS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setQueue(value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  queue === value ? 'bg-brand text-white' : 'text-ink-secondary hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {category === 'clash' && (
          <div className="flex gap-3 flex-wrap">
            <div className="flex gap-1 bg-bg-surface/80 backdrop-blur-sm border border-bg-elevated rounded-xl p-1 w-fit">
              <button
                onClick={() => setClashTierFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  clashTierFilter === 'all' ? 'bg-brand text-white' : 'text-ink-secondary hover:text-ink'
                }`}
              >
                Todos os Tiers
              </button>
              {CLASH_TIERS.map((tier) => (
                <button
                  key={tier}
                  onClick={() => setClashTierFilter(tier)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    clashTierFilter === tier ? 'bg-brand text-white' : 'text-ink-secondary hover:text-ink'
                  }`}
                >
                  {CLASH_TIER_LABEL[tier]}
                </button>
              ))}
            </div>

            <div className="flex gap-1 bg-bg-surface/80 backdrop-blur-sm border border-bg-elevated rounded-xl p-1 w-fit">
              <button
                onClick={() => setClashDayFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  clashDayFilter === 'all' ? 'bg-brand text-white' : 'text-ink-secondary hover:text-ink'
                }`}
              >
                Todos os Dias
              </button>
              {CLASH_DAYS.map((day) => (
                <button
                  key={day}
                  onClick={() => setClashDayFilter(day)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    clashDayFilter === day ? 'bg-brand text-white' : 'text-ink-secondary hover:text-ink'
                  }`}
                >
                  {CLASH_DAY_LABEL[day]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Jobs */}
      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div>
      ) : !filtered.length ? (
        <EmptyState icon={Briefcase} title={t('booster.jobs.empty')} description={t('booster.jobs.emptyDesc')} />
      ) : (
        <div className="space-y-3">
          {filtered.map((job) => {
            const isDuo = job.boost_mode === 'duo'
            const blocked = slotInfo && !canAcceptJob(job)
            const exclusiveLabel = exclusiveTimeLeft(job, profile?.id)

            return (
              <Card key={job.id} className={`flex items-center justify-between gap-4 ${exclusiveLabel ? 'border-accent/40' : ''}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs font-mono text-ink-muted">#{job.id.slice(0, 8).toUpperCase()}</span>
                    <span className="text-xs bg-bg-elevated text-ink-secondary px-2 py-0.5 rounded-lg">
                      {getServiceLabel(job.service_type)}
                    </span>
                    {(job.service_type === 'elo_boost' || job.service_type === 'win_boost' || job.service_type === 'md5') && (
                      <span className="text-xs bg-bg-elevated text-ink-secondary px-2 py-0.5 rounded-lg">
                        {job.queue_type === 'solo_duo' ? t('booster.jobs.soloQueue') : t('booster.jobs.flexQueue')}
                      </span>
                    )}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg uppercase tracking-wide ${
                      isDuo
                        ? 'bg-brand/10 text-brand border border-brand/20'
                        : 'bg-bg-elevated text-ink-muted'
                    }`}>
                      {getOrderModeType(job)}
                    </span>
                    {exclusiveLabel && (
                      <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg uppercase tracking-wide bg-accent/15 text-accent border border-accent/30">
                        <Sparkles className="h-3 w-3" />
                        Exclusivo para você · {exclusiveLabel}
                      </span>
                    )}
                    {job.drop_count > 0 && (
                      <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg uppercase tracking-wide bg-warning/15 text-warning border border-warning/30">
                        <History className="h-3 w-3" />
                        Pedido dropado · valor e prazo atualizados
                      </span>
                    )}
                  </div>
                  {job.current_rank && job.target_rank && (
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {job.drop_count > 0 && job.rank_before_last_drop && (
                        <>
                          <RankBadge
                            tier={(job.rank_before_last_drop as { tier: RankTier }).tier}
                            division={(job.rank_before_last_drop as { division: Division }).division}
                            size="xs"
                            showLabel={false}
                          />
                          <span className="text-xs font-medium text-ink-muted line-through">
                            {formatRank((job.rank_before_last_drop as { tier: RankTier }).tier, (job.rank_before_last_drop as { division: Division }).division)}
                          </span>
                          <span className="text-ink-muted text-xs">→</span>
                        </>
                      )}
                      <RankBadge
                        tier={(job.current_rank as { tier: RankTier }).tier}
                        division={(job.current_rank as { division: Division }).division}
                        size="xs"
                        showLabel={false}
                      />
                      <span className="text-xs font-medium text-ink-secondary">
                        {formatRank((job.current_rank as { tier: RankTier }).tier, (job.current_rank as { division: Division }).division)}
                      </span>
                      <span className="text-ink-muted text-xs">→</span>
                      <RankBadge
                        tier={(job.target_rank as { tier: RankTier }).tier}
                        division={(job.target_rank as { division: Division }).division}
                        size="xs"
                        showLabel={false}
                      />
                      <span className="text-xs font-medium text-ink-secondary">
                        {formatRank((job.target_rank as { tier: RankTier }).tier, (job.target_rank as { division: Division }).division)}
                      </span>
                    </div>
                  )}
                  {job.current_rank && !job.target_rank && (
                    <div className="flex items-center gap-2 mt-1">
                      <RankBadge
                        tier={(job.current_rank as { tier: RankTier }).tier}
                        division={(job.current_rank as { division: Division }).division}
                        size="xs"
                        showLabel={false}
                      />
                      <span className="text-xs font-medium text-ink-secondary">
                        {formatRank((job.current_rank as { tier: RankTier }).tier, (job.current_rank as { division: Division }).division)}
                      </span>
                      {job.wins_purchased != null && (
                        <span className="text-xs text-ink-muted">· {job.wins_purchased} vitória{job.wins_purchased === 1 ? '' : 's'}</span>
                      )}
                    </div>
                  )}
                  {job.extras?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {sortOrderExtras(job.extras).map((extra) => (
                        <span key={extra.extra_id} className="text-[10px] font-medium bg-bg-elevated text-ink-secondary px-2 py-0.5 rounded-lg">
                          {extra.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-ink-muted mt-0.5">{t('booster.jobs.posted', { time: timeAgo(job.created_at) })}</p>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-bold text-success">{currency(job.total_price * boosterEarningsShare(slotInfo?.is_top3))}</p>
                    <p className="text-[10px] text-ink-muted">{t('booster.jobs.yourCut', { pct: Math.round(boosterEarningsShare(slotInfo?.is_top3) * 100) })}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      size="sm"
                      onClick={() => acceptJob.mutate(job.id)}
                      loading={acceptJob.isPending}
                      disabled={!!blocked}
                      title={blocked ? 'Slots cheios' : undefined}
                    >
                      {t('booster.jobs.accept')}
                    </Button>
                    {acceptJob.isError && (
                      <p className="text-[10px] text-danger text-center max-w-[120px]">
                        {acceptJob.error instanceof Error ? acceptJob.error.message : 'Erro'}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
