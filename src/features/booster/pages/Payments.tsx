import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Wallet, Banknote, PiggyBank, Hourglass } from 'lucide-react'
import { Card, Skeleton, EmptyState, StatCard } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { useCurrency } from '@/hooks/useCurrency'
import type { PayoutRecord } from '@/types'

interface PayoutSummary {
  total_earned: number
  total_withdrawn: number
  available: number
  processing: number
}

function usePayoutSummary(userId: string | undefined) {
  return useQuery({
    queryKey: ['booster-payout-summary', userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('booster_payout_summary' as never, { p_booster_user_id: userId! } as never)
      if (error) throw error
      return data as unknown as PayoutSummary
    },
    enabled: !!userId,
  })
}

export function BoosterPaymentsPage() {
  const { profile } = useAuthStore()
  const { t } = useTranslation()
  const currency = useCurrency()

  const { data: payoutSummary, isLoading: loadingSummary } = usePayoutSummary(profile?.id)

  // Lista limitada só pra exibição — os totais de saldo vêm de
  // booster_payout_summary(), agregado no servidor sobre TODOS os payouts.
  const { data: payouts, isLoading: loadingPayouts } = useQuery({
    queryKey: ['booster-payouts', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payout_records')
        .select('*')
        .eq('booster_id', profile!.id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as PayoutRecord[]
    },
    enabled: !!profile?.id,
  })

  const totalEarned = payoutSummary?.total_earned ?? 0
  const totalWithdrawn = payoutSummary?.total_withdrawn ?? 0
  const available = payoutSummary?.available ?? 0
  const processing = payoutSummary?.processing ?? 0

  const BALANCE_BOXES = [
    { label: 'Total Ganho', value: totalEarned, icon: Wallet, color: 'text-success bg-success/10' },
    { label: 'Total Sacado', value: totalWithdrawn, icon: Banknote, color: 'text-brand bg-brand/10' },
    { label: 'Valor Disponível', value: available, icon: PiggyBank, color: 'text-success bg-success/10' },
    { label: 'Pagamento Pendente', value: processing, icon: Hourglass, color: 'text-warning bg-warning/10' },
  ]

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Pagamentos</h1>
        <p className="text-ink-secondary mt-1">Saldo, saques e histórico de pagamentos por pedido.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {BALANCE_BOXES.map(({ label, value, icon, color }) => (
          <StatCard
            key={label}
            label={label}
            icon={icon}
            color={color}
            value={loadingSummary ? <Skeleton className="h-6 w-20" /> : currency(value)}
          />
        ))}
      </div>

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
