import { useQuery } from '@tanstack/react-query'
import { Wallet, Banknote, PiggyBank, Hourglass, CalendarClock } from 'lucide-react'
import { Card, Skeleton, EmptyState } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { formatDate } from '@/lib/utils'
import type { Order, PayoutRecord } from '@/types'
import { useTranslation } from 'react-i18next'
import { useCurrency } from '@/hooks/useCurrency'
import { CompletedOrderCard } from '@/features/booster/components/CompletedOrderCard'

export function BoosterEarningsPage() {
  const { profile } = useAuthStore()
  const { t } = useTranslation()
  const currency = useCurrency()

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
    enabled: !!profile?.id,
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
    enabled: !!profile?.id,
  })

  // Total Ganho: soma líquida de todos os payouts, independente do status.
  const totalEarned = payouts?.reduce((s, p) => s + Number(p.net_amount), 0) ?? 0
  // Total Sacado: já pago/transferido ao booster.
  const totalWithdrawn = payouts?.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.net_amount), 0) ?? 0
  // Valor Disponível: liberado, ainda não solicitado/processado.
  const available = payouts?.filter(p => p.status === 'pending').reduce((s, p) => s + Number(p.net_amount), 0) ?? 0
  // Pagamento Pendente: em processamento no gateway/financeiro.
  const processing = payouts?.filter(p => p.status === 'processing').reduce((s, p) => s + Number(p.net_amount), 0) ?? 0

  const STAT_BOXES = [
    { label: 'Total Ganho', value: totalEarned, icon: Wallet, color: 'text-success bg-success/10' },
    { label: 'Total Sacado', value: totalWithdrawn, icon: Banknote, color: 'text-brand bg-brand/10' },
    { label: 'Valor Disponível', value: available, icon: PiggyBank, color: 'text-success bg-success/10' },
    { label: 'Pagamento Pendente', value: processing, icon: Hourglass, color: 'text-warning bg-warning/10' },
  ]

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold text-ink">{t('booster.earnings.title')}</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_BOXES.map(({ label, value, icon: Icon, color }) => (
          <Card key={label} padding="md">
            <div className={`h-8 w-8 rounded-lg ${color} flex items-center justify-center mb-3`}>
              <Icon className="h-4 w-4" />
            </div>
            <p className="text-xl font-bold text-ink">{loadingPayouts ? <Skeleton className="h-6 w-20" /> : currency(value)}</p>
            <p className="text-xs text-ink-secondary mt-0.5">{label}</p>
          </Card>
        ))}
      </div>

      {/* Serviços do mês — substitui o gráfico mensal */}
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

      {/* Payout history */}
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
