import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ShoppingBag, Search } from 'lucide-react'
import { EmptyState, Skeleton } from '@/components/ui'
import { OrderRow } from '@/components/order/OrderRow'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { getServiceLabel } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { ORDER_SAFE_COLUMNS } from '@/lib/orderColumns'
import type { Order, OrderStatus } from '@/types'

export function OrderHistoryPage() {
  const navigate = useNavigate()
  const { profile } = useAuthStore()
  const { t } = useTranslation()
  const currency = useCurrency()
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all')
  const [search, setSearch] = useState('')

  const STATUS_FILTERS: { label: string; value: OrderStatus | 'all' }[] = [
    { label: t('customer.history.filters.all'),       value: 'all'        },
    { label: t('customer.history.filters.active'),    value: 'in_progress'},
    { label: t('customer.history.filters.completed'), value: 'completed'  },
  ]

  const { data: orders, isLoading } = useQuery({
    queryKey: ['customer-orders', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_SAFE_COLUMNS)
        .eq('customer_id', profile!.id)
        .neq('status', 'canceled')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as unknown as Order[]
    },
    enabled: !!profile?.id,
    refetchInterval: 15000,
  })

  const filtered = orders?.filter((o) => {
    if (filter !== 'all' && o.status !== filter) return false
    if (search && !o.id.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }) ?? []

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-ink">{t('customer.history.title')}</h1>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted pointer-events-none" />
          <input
            type="text"
            placeholder={t('customer.history.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base pl-9"
          />
        </div>
        <div className="flex gap-1 bg-bg-surface border border-bg-elevated rounded-xl p-1">
          {STATUS_FILTERS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === value ? 'bg-brand text-white' : 'text-ink-secondary hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Order list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}
        </div>
      ) : !filtered.length ? (
        <EmptyState
          icon={ShoppingBag}
          title={t('customer.history.empty')}
          description={filter !== 'all' ? t('customer.history.emptyFilter') : t('customer.history.emptyAll')}
          action={filter === 'all' ? { label: t('customer.history.startBoost'), onClick: () => navigate('/orders/new?new=1') } : undefined}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              currency={currency}
              subtitle={getServiceLabel(order.service_type)}
              showIcon={false}
            />
          ))}
        </div>
      )}
    </div>
  )
}
