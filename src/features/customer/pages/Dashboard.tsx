import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, ShoppingBag, MessageCircle, Zap, Sparkles } from 'lucide-react'
import { Button, Skeleton, EmptyState, StatCard } from '@/components/ui'
import { OrderRow } from '@/components/order/OrderRow'
import { useAuthStore } from '@/stores/authStore'
import { useCurrency } from '@/hooks/useCurrency'
import { useCustomerOrders } from '@/api/orders'
import { useCustomerDashboardStats } from '@/api/customers'

export function CustomerDashboard() {
  const { profile } = useAuthStore()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const currency = useCurrency()
  const { data: orders, isLoading } = useCustomerOrders(profile?.id, 5)
  const { data: stats } = useCustomerDashboardStats(profile?.id)

  const activeOrders = orders?.filter(o =>
    ['paid', 'awaiting_assignment', 'assigned', 'in_progress', 'paused', 'awaiting_customer'].includes(o.status)
  ) ?? []

  const activeCount = stats?.activeOrders ?? 0

  const activeMsg = activeCount === 0
    ? t('customer.dashboard.noActive')
    : activeCount === 1
      ? t('customer.dashboard.activeCount', { count: 1 })
      : t('customer.dashboard.activeCountPlural', { count: activeCount })

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">
            {t('customer.dashboard.welcome')}, {profile?.username}
            <Sparkles className="ml-2 inline h-5 w-5 text-accent align-[-2px]" />
          </h1>
          <p className="text-ink-secondary mt-1">{activeMsg}</p>
        </div>
        <Button asChild>
          <Link to="/orders/new">
            <Plus className="h-4 w-4" />
            {t('customer.dashboard.newOrder')}
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t('customer.dashboard.stats.active'),    value: activeCount,                          icon: Zap,           color: 'text-brand bg-brand/10' },
          { label: t('customer.dashboard.stats.total'),     value: stats?.totalOrders ?? 0,               icon: ShoppingBag,   color: 'text-accent bg-accent/10'  },
          { label: t('customer.dashboard.stats.completed'), value: stats?.completedOrders ?? 0,           icon: ShoppingBag,   color: 'text-success bg-success/10' },
          { label: t('customer.dashboard.stats.spent'),     value: currency(stats?.totalSpent ?? 0),      icon: MessageCircle, color: 'text-info bg-info/10' },
        ].map(({ label, value, icon, color }) => (
          <StatCard key={label} label={label} value={value} icon={icon} color={color} valueSize="lg" />
        ))}
      </div>

      {activeOrders.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-ink mb-3">{t('customer.dashboard.activeTitle')}</h2>
          <div className="space-y-3">
            {activeOrders.map((order) => (
              <OrderRow key={order.id} order={order} currency={currency} />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-ink">{t('customer.dashboard.recentTitle')}</h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/orders">{t('customer.dashboard.viewAll')}</Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="card p-4"><Skeleton className="h-12 w-full" /></div>
            ))}
          </div>
        ) : !orders?.length ? (
          <EmptyState
            icon={ShoppingBag}
            title={t('customer.dashboard.empty')}
            description={t('customer.dashboard.emptyDesc')}
            action={{ label: t('customer.dashboard.startBoost'), onClick: () => navigate('/orders/new') }}
          />
        ) : (
          <div className="space-y-3">
            {orders.slice(0, 5).map((order) => (
              <OrderRow key={order.id} order={order} currency={currency} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
