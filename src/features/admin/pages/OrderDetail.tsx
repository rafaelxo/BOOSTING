import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, RefreshCw, UserCheck } from 'lucide-react'
import { Button, Card, OrderStatusBadge } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { formatCurrency, formatDateTime, formatRank } from '@/lib/utils'
import type { Order, OrderStatus } from '@/types'

const ADMIN_STATUS_OPTIONS: OrderStatus[] = [
  'awaiting_assignment', 'assigned', 'in_progress', 'paused',
  'awaiting_customer', 'completed', 'disputed', 'refunded', 'canceled',
]

export function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuthStore()
  const queryClient = useQueryClient()

  const { data: order } = useQuery({
    queryKey: ['admin-order', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('orders').select('*').eq('id', id).single()
      if (error) throw error
      return data as Order
    },
  })

  const updateStatus = useMutation({
    mutationFn: async (newStatus: OrderStatus) => {
      if (!order) return
      await supabase.from('orders').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id)
      await supabase.from('order_status_history').insert({
        order_id: id, from_status: order.status, to_status: newStatus, changed_by: profile?.id, reason: 'Admin override',
      })
      await supabase.from('audit_logs').insert({
        actor_id: profile?.id, actor_role: profile?.role, action: 'order.status_override',
        entity_type: 'order', entity_id: id!, diff: { from: order.status, to: newStatus },
      })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-order', id] }),
  })

  if (!order) return null

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon"><Link to="/admin/orders"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-ink">Order #{order.id.slice(0, 8).toUpperCase()}</h1>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="text-xs text-ink-muted mt-0.5">Created {formatDateTime(order.created_at)}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card padding="md">
            <h3 className="text-sm font-semibold text-ink mb-4">Order Details</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Customer ID', order.customer_id.slice(0, 12) + '...'],
                ['Service', (order.service_id as string).replace(/_/g, ' ')],
                ['Server', order.server],
                ['Queue', order.queue_type === 'solo_duo' ? 'Solo/Duo' : 'Flex'],
                ['Base Price', formatCurrency(order.base_price)],
                ['Extras', formatCurrency(order.extras_price)],
                ['Total', formatCurrency(order.total_price)],
                ['Booster', order.assigned_booster_id ? order.assigned_booster_id.slice(0, 12) + '...' : 'Unassigned'],
              ].map(([l, v]) => (
                <div key={l as string}>
                  <p className="text-xs text-ink-muted">{l as string}</p>
                  <p className="text-sm font-semibold text-ink capitalize">{v as string}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          {/* Status override */}
          <Card padding="md">
            <h3 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-ink-secondary" />
              Override Status
            </h3>
            <div className="space-y-1.5">
              {ADMIN_STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => updateStatus.mutate(s)}
                  disabled={order.status === s || updateStatus.isPending}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    order.status === s
                      ? 'bg-brand-muted text-brand cursor-default'
                      : 'text-ink-secondary hover:bg-bg-elevated hover:text-ink'
                  }`}
                >
                  {s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </button>
              ))}
            </div>
          </Card>

          {/* Booster assignment */}
          <Card padding="md">
            <h3 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-ink-secondary" />
              Assignment
            </h3>
            <p className="text-xs text-ink-secondary mb-3">
              {order.assigned_booster_id ? `Booster: ${order.assigned_booster_id.slice(0, 12)}...` : 'No booster assigned.'}
            </p>
            <Button size="sm" variant="secondary" className="w-full">
              Reassign Booster
            </Button>
          </Card>
        </div>
      </div>
    </div>
  )
}
