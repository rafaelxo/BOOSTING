import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ShoppingBag, Search } from 'lucide-react'
import { EmptyState, Skeleton } from '@/components/ui'
import { CustomerOrderCard } from '@/components/order/CustomerOrderCard'
import { useAuthStore } from '@/stores/authStore'
import { useCurrency } from '@/hooks/useCurrency'
import { useCustomerOrders } from '@/api/orders'
import type { OrderStatus } from '@/types'

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

  const { data: orders, isLoading } = useCustomerOrders(profile?.id, 100)

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
        <div className="flex gap-1 bg-bg-surface/80 backdrop-blur-sm border border-bg-elevated rounded-xl p-1">
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

      {/* Order grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}
        </div>
      ) : !filtered.length ? (
        <EmptyState
          icon={ShoppingBag}
          title={t('customer.history.empty')}
          description={filter !== 'all' ? t('customer.history.emptyFilter') : t('customer.history.emptyAll')}
          action={filter === 'all' ? { label: t('customer.history.startBoost'), onClick: () => navigate('/orders/new?new=1') } : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((order) => (
            <CustomerOrderCard key={order.id} order={order} currency={currency} />
          ))}
        </div>
      )}
    </div>
  )
}
