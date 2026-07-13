import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { ShoppingBag, DollarSign, Users, AlertCircle } from 'lucide-react'
import { Card, OrderStatusBadge, Skeleton } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { timeAgo } from '@/lib/utils'
import type { Order } from '@/types'
import { Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useTranslation } from 'react-i18next'
import { useCurrency } from '@/hooks/useCurrency'

interface AdminDashboardStats {
  total_revenue: number
  active_orders_count: number
  pending_boosters_count: number
  open_tickets_count: number
  urgent_tickets_count: number
  recent_orders: Pick<Order, 'id' | 'status' | 'total_price' | 'created_at'>[]
  daily_orders: { day: string; count: number }[]
}

// Server-side aggregate (admin_dashboard_stats RPC) instead of downloading
// the entire orders/payments/booster_profiles/support_tickets tables to the
// client just to compute counts and sums, repeated every 30s.
function useAdminStats() {
  return useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_dashboard_stats' as never)
      if (error) throw error
      return data as unknown as AdminDashboardStats
    },
    refetchInterval: 30000,
  })
}

export function AdminOverview() {
  const { data: stats, isLoading } = useAdminStats()
  const { t } = useTranslation()
  const currency = useCurrency()

  const recentOrders = stats?.recent_orders ?? []

  const chartData = useMemo(() =>
    (stats?.daily_orders ?? []).map(({ day, count }) => {
      const label = new Date(`${day}T00:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' })
      return { day: label.charAt(0).toUpperCase() + label.slice(1, 3), orders: count }
    })
  , [stats?.daily_orders])

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">{t('admin.overview.title')}</h1>
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-slow" />
          {t('admin.overview.live')}
        </div>
      </div>

      {/* KPI cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: t('admin.overview.totalRevenue'), value: currency(stats?.total_revenue ?? 0), icon: DollarSign, color: 'text-success bg-success/10', trend: '+12%' },
            { label: t('admin.overview.activeOrders'), value: stats?.active_orders_count ?? 0, icon: ShoppingBag, color: 'text-brand bg-brand/10', trend: null },
            { label: t('admin.overview.pendingBoosters'), value: stats?.pending_boosters_count ?? 0, icon: Users, color: 'text-warning bg-warning/10', trend: null },
            { label: t('admin.overview.openTickets'), value: `${stats?.open_tickets_count ?? 0}${stats?.urgent_tickets_count ? ` (${stats.urgent_tickets_count} ${t('admin.overview.urgent')})` : ''}`, icon: AlertCircle, color: stats?.urgent_tickets_count ? 'text-danger bg-danger/10' : 'text-info bg-info/10', trend: null },
          ].map(({ label, value, icon: Icon, color, trend }) => (
            <Card key={label} padding="md">
              <div className="flex items-start justify-between mb-3">
                <div className={`h-9 w-9 rounded-xl ${color} flex items-center justify-center`}>
                  <Icon className="h-4 w-4" />
                </div>
                {trend && <span className="text-xs font-semibold text-success">{trend}</span>}
              </div>
              <p className="text-xl font-bold text-ink">{value}</p>
              <p className="text-xs text-ink-secondary mt-0.5">{label}</p>
            </Card>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Orders chart */}
        <Card padding="md">
          <h3 className="text-sm font-semibold text-ink mb-4">{t('admin.overview.ordersWeek')}</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData}>
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#555A70' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#555A70' }} />
              <Tooltip
                contentStyle={{ background: '#181C2E', border: '1px solid #1E2338', borderRadius: '0.75rem' }}
                labelStyle={{ color: '#F1F4FF', fontSize: 12 }}
              />
              <Bar dataKey="orders" fill="#5B6CFF" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Recent orders */}
        <Card padding="md">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-ink">{t('admin.overview.recentOrders')}</h3>
            <Link to="/admin/orders" className="text-xs text-brand hover:underline">{t('admin.overview.viewAll')}</Link>
          </div>
          <div className="space-y-2">
            {recentOrders.map((order) => (
              <Link key={order.id} to={`/admin/orders/${order.id}`}>
                <div className="flex items-center justify-between py-2 hover:bg-bg-elevated rounded-lg px-2 -mx-2 transition-colors cursor-pointer">
                  <div>
                    <p className="text-xs font-mono text-ink">#{order.id.slice(0, 8).toUpperCase()}</p>
                    <p className="text-[10px] text-ink-muted">{timeAgo(order.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-ink">{currency(order.total_price)}</span>
                    <OrderStatusBadge status={order.status} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
