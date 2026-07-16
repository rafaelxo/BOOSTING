import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Briefcase, Clock, Swords, Users, CalendarClock, Wallet, ArrowRight,
  Trophy, Target, Star, CheckCircle2, TrendingUp,
} from 'lucide-react'
import { Button, Card, Skeleton, StatCard, EmptyState } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { ORDER_SAFE_COLUMNS } from '@/lib/orderColumns'
import { useAuthStore } from '@/stores/authStore'
import type { Order, BoosterProfile } from '@/types'
import { useTranslation } from 'react-i18next'
import { CompletedOrderCard } from '@/features/booster/components/CompletedOrderCard'

interface PerformanceSummary {
  total_matches: number
  wins: number
  losses: number
  average_kda: number | null
  review_count: number
  average_rating: number | null
}

function usePerformanceSummary(boosterId: string | undefined) {
  return useQuery({
    queryKey: ['booster-performance-summary', boosterId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booster_performance_segments')
        .select('total_matches, wins, losses, average_kda, review_count, average_rating')
        .eq('booster_id', boosterId!)
        .eq('service_type', '__all__')
        .eq('rank_bucket', '__all__')
        .maybeSingle()
      if (error) throw error
      return data as PerformanceSummary | null
    },
    enabled: !!boosterId,
  })
}

function useBoosterProfile(userId: string) {
  return useQuery({
    queryKey: ['booster-profile-full', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booster_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      return data as unknown as BoosterProfile | null
    },
    enabled: !!userId,
  })
}

// orders.assigned_booster_id FKs to profiles.id (the auth uid), which is
// booster_profiles.user_id — NOT booster_profiles.id. Must filter by the
// auth uid, never by the booster_profiles row's own primary key.
function useAssignedOrders(boosterUserId: string | undefined) {
  return useQuery({
    queryKey: ['booster-assigned-orders', boosterUserId],
    enabled: !!boosterUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_SAFE_COLUMNS)
        .eq('assigned_booster_id', boosterUserId!)
        .in('status', ['assigned', 'in_progress', 'paused', 'awaiting_customer'])
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as Order[]
    },
  })
}

export function BoosterDashboard() {
  const { profile } = useAuthStore()
  const { t } = useTranslation()
  const { data: boosterProfile, isLoading: profileLoading } = useBoosterProfile(profile?.id ?? '')
  const { data: activeOrders } = useAssignedOrders(profile?.id)
  const { data: performance, isLoading: loadingPerformance } = usePerformanceSummary(
    boosterProfile?.status === 'approved' ? profile?.id : undefined,
  )

  const { data: slotInfo } = useQuery({
    queryKey: ['booster-slots', profile?.id],
    queryFn: async () => {
      const { data } = await supabase.rpc('can_booster_accept_order', {
        p_booster_user_id: profile!.id,
        p_boost_mode: 'solo',
      })
      return data as unknown as { solo_count: number; duo_count: number; total_count: number; max_total: number; max_duo: number; is_top3: boolean; exclusive_slot_used: boolean; max_exclusive: number } | null
    },
    enabled: !!profile?.id && boosterProfile?.status === 'approved',
  })

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const { data: monthOrders, isLoading: loadingMonthOrders } = useQuery({
    queryKey: ['booster-month-orders', profile?.id, monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_SAFE_COLUMNS)
        .eq('assigned_booster_id', profile!.id)
        .eq('status', 'completed')
        .gte('completed_at', monthStart)
        .order('completed_at', { ascending: false })
      if (error) throw error
      return data as unknown as Order[]
    },
    enabled: !!profile?.id && boosterProfile?.status === 'approved',
  })

  if (profileLoading) return <Skeleton className="h-64 w-full" />

  // If not yet approved, show onboarding notice
  if (boosterProfile?.status !== 'approved') {
    return (
      <div className="max-w-xl">
        <Card padding="lg" variant="brand" className="text-center">
          <div className="h-14 w-14 rounded-2xl bg-warning/10 flex items-center justify-center mx-auto mb-4">
            <Clock className="h-7 w-7 text-warning" />
          </div>
          <h2 className="text-xl font-bold text-ink mb-2">{t('booster.dashboard.pending.title')}</h2>
          <p className="text-ink-secondary text-sm">
            {t('booster.dashboard.pending.desc')}
          </p>
          <p className="mt-3 text-xs text-ink-muted">{t('booster.dashboard.pending.statusLabel')} <strong className="text-warning">{boosterProfile?.status ?? 'pending'}</strong></p>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t('booster.nav.dashboard')}</h1>
          <p className="text-ink-secondary mt-1">
            {activeOrders?.length
              ? t('booster.dashboard.activeCount', { count: activeOrders.length })
              : t('booster.dashboard.noActive')}
          </p>
        </div>
        <Button asChild>
          <Link to="/booster/jobs">
            <Briefcase className="h-4 w-4" />
            {t('booster.dashboard.browseJobs')}
          </Link>
        </Button>
      </div>

      {/* Performance */}
      <div>
        <h2 className="text-base font-semibold text-ink mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-ink-muted" />
          Performance
        </h2>
        {loadingPerformance ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
          </div>
        ) : !performance || performance.total_matches === 0 ? (
          <Card padding="md">
            <EmptyState
              icon={Trophy}
              title="Ainda sem estatísticas suficientes"
              description="Complete seus primeiros pedidos para ver win rate, KDA e avaliações aqui."
            />
          </Card>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Win rate"
              icon={Target}
              color="text-success bg-success/10"
              value={`${((performance.wins / performance.total_matches) * 100).toFixed(1)}%`}
            />
            <StatCard
              label="KDA médio"
              icon={Swords}
              color="text-brand bg-brand/10"
              value={performance.average_kda != null ? performance.average_kda.toFixed(1) : '—'}
            />
            <StatCard
              label="Avaliação"
              icon={Star}
              color="text-warning bg-warning/10"
              value={performance.average_rating != null ? `${performance.average_rating.toFixed(1)} (${performance.review_count})` : 'Sem avaliações'}
            />
            <StatCard
              label="Serviços concluídos"
              icon={CheckCircle2}
              color="text-accent bg-accent/10"
              value={boosterProfile?.total_completed ?? 0}
            />
          </div>
        )}
      </div>

      {/* Slot usage */}
      {slotInfo && (
        <Card padding="md" className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-sm font-semibold text-ink flex items-center gap-2">
                Slots de Pedido
                {slotInfo.is_top3 && (
                  <span className="text-[10px] font-bold bg-warning/10 text-warning border border-warning/20 rounded-lg px-2 py-0.5 uppercase tracking-wide">
                    TOP 3
                  </span>
                )}
              </p>
              <p className="text-xs text-ink-muted mt-0.5">
                {slotInfo.is_top3 ? 'Top3: máx 3 pedidos (máx 2 duo)' : 'Normal: máx 3 pedidos (máx 1 duo)'} + 1 exclusivo
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Swords className="h-4 w-4 text-ink-muted" />
              <span className="text-ink-secondary">Solo:</span>
              <span className="font-bold text-ink">{slotInfo.solo_count}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-ink-muted" />
              <span className="text-ink-secondary">Duo:</span>
              <span className="font-bold text-ink">{slotInfo.duo_count}/{slotInfo.max_duo}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-ink-secondary">Total:</span>
              <span className={`font-bold ${slotInfo.total_count >= slotInfo.max_total ? 'text-danger' : slotInfo.total_count === slotInfo.max_total - 1 ? 'text-warning' : 'text-success'}`}>
                {slotInfo.total_count}/{slotInfo.max_total}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-ink-secondary">Exclusivo:</span>
              <span className={`font-bold ${slotInfo.exclusive_slot_used ? 'text-danger' : 'text-success'}`}>
                {slotInfo.exclusive_slot_used ? 1 : 0}/1
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* Serviços concluídos este mês */}
      <div>
        <h3 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-ink-muted" />
          Serviços concluídos este mês
        </h3>
        {loadingMonthOrders ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}
          </div>
        ) : !monthOrders?.length ? (
          <Card padding="md">
            <p className="text-sm text-ink-muted text-center py-4">Nenhum serviço concluído neste mês ainda.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {monthOrders.map((order) => <CompletedOrderCard key={order.id} order={order} />)}
          </div>
        )}
      </div>

      {/* Ganhos — detalhe completo em Pagamentos */}
      <Link to="/booster/payments">
        <Card padding="md" className="flex items-center justify-between hover:border-brand/20 hover:shadow-card-hover transition-all">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
              <Wallet className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Saldo e pagamentos</p>
              <p className="text-xs text-ink-muted">Veja saldo disponível, saques e histórico completo</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-ink-muted shrink-0" />
        </Card>
      </Link>
    </div>
  )
}
