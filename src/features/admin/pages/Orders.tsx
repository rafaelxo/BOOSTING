import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { OrderStatusBadge, Skeleton, EmptyState, ErrorAlert, Button } from '@/components/ui'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { timeAgo, getServiceLabel } from '@/lib/utils'
import type { OrderStatus, ServiceType } from '@/types'
import { useTranslation } from 'react-i18next'
import { useCurrency } from '@/hooks/useCurrency'
import { useAdminOrders } from '@/api/orders'

const SERVICE_TYPE_OPTS: { label: string; value: ServiceType | 'all' }[] = [
  { label: 'Todos', value: 'all' },
  { label: 'Elo Boost', value: 'elo_boost' },
  { label: 'Vitórias / MD5', value: 'win_boost' },
  { label: 'Coaching', value: 'coaching' },
  { label: 'Clash', value: 'clash' },
]

export function AdminOrdersPage() {
  const [status, setStatus] = useState<OrderStatus | 'all'>('all')
  const [serviceType, setServiceType] = useState<ServiceType | 'all'>('all')
  const [search, setSearch] = useState('')
  const { t } = useTranslation()
  const currency = useCurrency()

  const STATUS_OPTS: { label: string; value: OrderStatus | 'all' }[] = [
    { label: t('admin.orders.filters.all'), value: 'all' },
    { label: t('admin.orders.filters.active'), value: 'in_progress' },
    { label: t('admin.orders.filters.awaiting'), value: 'awaiting_assignment' },
    { label: t('admin.orders.filters.completed'), value: 'completed' },
    // "Todos" nunca inclui cancelados (listAdminOrders já filtra) -- pra
    // auditoria, o admin ainda consegue vê-los explicitamente aqui.
    { label: t('admin.orders.filters.canceled'), value: 'canceled' },
  ]

  const { data: orders, isLoading, isError, refetch } = useAdminOrders(status, serviceType)

  const filtered = orders?.filter((o) =>
    !search || o.id.toLowerCase().includes(search.toLowerCase())
  ) ?? []

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-ink">{t('admin.orders.title')}</h1>
      {(orders?.length ?? 0) >= 100 && (
        <p className="text-xs text-warning">Mostrando os 100 pedidos mais recentes deste filtro — pode haver mais.</p>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted pointer-events-none" />
          <input className="input-base pl-9" placeholder={t('admin.orders.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 bg-bg-surface/80 backdrop-blur-sm border border-bg-elevated rounded-xl p-1 overflow-x-auto">
          {STATUS_OPTS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setStatus(value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${status === value ? 'bg-brand text-white' : 'text-ink-secondary hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-bg-surface/80 backdrop-blur-sm border border-bg-elevated rounded-xl p-1 overflow-x-auto">
          {SERVICE_TYPE_OPTS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setServiceType(value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${serviceType === value ? 'bg-brand text-white' : 'text-ink-secondary hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="card p-0">
        {isLoading ? (
          <div className="p-4"><Skeleton className="h-64 w-full" /></div>
        ) : isError ? (
          <div className="p-4 space-y-3">
            <ErrorAlert message="Não foi possível carregar os pedidos." />
            <Button size="sm" onClick={() => refetch()}>Tentar novamente</Button>
          </div>
        ) : !filtered.length ? (
          <EmptyState icon={Search} title={t('admin.orders.empty')} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('admin.orders.table.id')}</TableHead>
                <TableHead>{t('admin.orders.table.service')}</TableHead>
                <TableHead>{t('admin.orders.table.amount')}</TableHead>
                <TableHead>{t('admin.orders.table.status')}</TableHead>
                <TableHead>{t('admin.orders.table.created')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((order) => (
                <TableRow key={order.id} clickable>
                  <TableCell>
                    <Link to={`/admin/orders/${order.id}`} className="font-mono text-brand hover:underline text-xs">
                      #{order.id.slice(0, 8).toUpperCase()}
                    </Link>
                  </TableCell>
                  <TableCell className="text-ink">{getServiceLabel(order.service_type)}</TableCell>
                  <TableCell className="font-semibold text-ink">{currency(order.total_price)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <OrderStatusBadge status={order.status} />
                      {order.preferred_booster_id && order.exclusive_until && new Date(order.exclusive_until) > new Date() && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-accent/15 text-accent border border-accent/30 uppercase tracking-wide">
                          Exclusivo
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{timeAgo(order.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
