import { Link } from 'react-router-dom'
import { Zap } from 'lucide-react'
import { Card, OrderStatusBadge } from '@/components/ui'
import { timeAgo } from '@/lib/utils'
import type { Order } from '@/types'

interface OrderRowProps {
  order: Order
  currency: (amount: number) => string
  subtitle?: string
  showIcon?: boolean
}

export function OrderRow({ order, currency, subtitle, showIcon = true }: OrderRowProps) {
  return (
    <Link to={`/orders/${order.id}`}>
      <Card className="flex items-center justify-between gap-4 hover:border-brand/20 hover:shadow-card-hover transition-all duration-150 cursor-pointer">
        <div className="flex items-center gap-4 min-w-0">
          {showIcon && (
            <div className="h-10 w-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
              <Zap className="h-5 w-5 text-brand" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm font-semibold text-ink truncate">
                #{order.id.slice(0, 8).toUpperCase()}
              </p>
              {subtitle && <span className="hidden sm:block text-xs text-ink-muted">{subtitle}</span>}
            </div>
            <p className="text-xs text-ink-muted">{timeAgo(order.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <span className="hidden sm:block text-sm font-semibold text-ink">
            {currency(order.total_price)}
          </span>
          <OrderStatusBadge status={order.status} />
        </div>
      </Card>
    </Link>
  )
}
