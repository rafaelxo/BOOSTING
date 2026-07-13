import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Briefcase, Clock, Swords, Users,
  Wallet, Banknote, PiggyBank, Hourglass, CalendarClock,
} from 'lucide-react'
import { Button, Card, Skeleton, EmptyState } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { formatDate } from '@/lib/utils'
import type { Order, BoosterProfile, PayoutRecord } from '@/types'
import { useTranslation } from 'react-i18next'
import { useCurrency } from '@/hooks/useCurrency'
import { CompletedOrderCard } from '@/features/booster/components/CompletedOrderCard'

function useBoosterProfile(userId: string) {
  return useQuery({
    queryKey: ['booster-profile', userId],
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

function useAssignedOrders(boosterId: string | undefined) {
  return useQuery({
    queryKey: ['booster-assigned-orders', boosterId],
    enabled: !!boosterId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('assigned_booster_id', boosterId!)
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
  const currency = useCurrency()
  const { data: boosterProfile, isLoading: profileLoading } = useBoosterProfile(profile?.id ?? '')
  const { data: activeOrders } = useAssignedOrders(boosterProfile?.id)

  const { data: slotInfo } = useQuery({
    queryKey: ['booster-slots', profile?.id],
    queryFn: async () => {
      const { data } = await supabase.rpc('can_booster_accept_order', {
        p_booster_user_id: profile!.id,
        p_boost_mode: 'solo',
      })
      return data as unknown as { solo_count: number; duo_count: number; total_count: number; max_total: number; max_duo: number; is_top5: boolean } | null
    },
    enabled: !!profile?.id && boosterProfile?.status === 'approved',
  })

  const { data: payouts, isLoading: loadingPayouts } = useQuery({
    queryKey: ['booster-payouts', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payout_records')
        .select('*')
        .eq('booster_id', profile!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as PayoutRecord[]
    },
    enabled: !!profile?.id && boosterProfile?.status === 'approved',
  })

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const { data: monthOrders, isLoading: loadingMonthOrders } = useQuery({
    queryKey: ['booster-month-orders', profile?.id, monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
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

  // Total Ganho: soma líquida de todos os payouts, independente do status.
  const totalEarned = payouts?.reduce((s, p) => s + Number(p.net_amount), 0) ?? 0
  // Total Sacado: já pago/transferido ao booster.
  const totalWithdrawn = payouts?.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.net_amount), 0) ?? 0
  // Valor Disponível: liberado, ainda não solicitado/processado.
  const available = payouts?.filter(p => p.status === 'pending').reduce((s, p) => s + Number(p.net_amount), 0) ?? 0
  // Pagamento Pendente: em processamento no gateway/financeiro.
  const processing = payouts?.filter(p => p.status === 'processing').reduce((s, p) => s + Number(p.net_amount), 0) ?? 0

  const BALANCE_BOXES = [
    { label: 'Total Ganho', value: totalEarned, icon: Wallet, color: 'text-success bg-success/10' },
    { label: 'Total Sacado', value: totalWithdrawn, icon: Banknote, color: 'text-brand bg-brand/10' },
    { label: 'Valor Disponível', value: available, icon: PiggyBank, color: 'text-success bg-success/10' },
    { label: 'Pagamento Pendente', value: processing, icon: Hourglass, color: 'text-warning bg-warning/10' },
  ]

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

      {/* Saldo e movimentações */}
      <div>
        <h2 className="text-base font-semibold text-ink mb-3">Saldo</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {BALANCE_BOXES.map(({ label, value, icon: Icon, color }) => (
            <Card key={label} padding="md">
              <div className={`h-8 w-8 rounded-lg ${color} flex items-center justify-center mb-3`}>
                <Icon className="h-4 w-4" />
              </div>
              <p className="text-xl font-bold text-ink">{loadingPayouts ? <Skeleton className="h-6 w-20" /> : currency(value)}</p>
              <p className="text-xs text-ink-secondary mt-0.5">{label}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* Slot usage */}
      {slotInfo && (
        <Card padding="md" className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-sm font-semibold text-ink flex items-center gap-2">
                Slots de Pedido
                {slotInfo.is_top5 && (
                  <span className="text-[10px] font-bold bg-warning/10 text-warning border border-warning/20 rounded-lg px-2 py-0.5 uppercase tracking-wide">
                    TOP 5
                  </span>
                )}
              </p>
              <p className="text-xs text-ink-muted mt-0.5">
                {slotInfo.is_top5 ? 'Top5: máx 3 pedidos (máx 2 duo)' : 'Normal: máx 3 pedidos (máx 1 duo)'}
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

      {/* Histórico de pagamentos (movimentações recentes) */}
      <Card padding="md">
        <h3 className="text-sm font-semibold text-ink mb-4">{t('booster.earnings.payoutHistory')}</h3>
        {loadingPayouts ? (
          <Skeleton className="h-32 w-full" />
        ) : !payouts?.length ? (
          <EmptyState icon={Wallet} title={t('booster.earnings.noPayouts')} />
        ) : (
          <div className="space-y-2">
            {payouts.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2.5 border-b border-bg-elevated last:border-0">
                <div>
                  <p className="text-sm font-medium text-ink">{t('booster.earnings.order', { id: p.order_id.slice(0, 8).toUpperCase() })}</p>
                  <p className="text-xs text-ink-muted">{formatDate(p.created_at)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-success">{currency(p.net_amount)}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    p.status === 'paid' ? 'bg-success/10 text-success' :
                    p.status === 'pending' ? 'bg-warning/10 text-warning' :
                    p.status === 'processing' ? 'bg-brand/10 text-brand' :
                    'bg-danger/10 text-danger'
                  }`}>
                    {p.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
