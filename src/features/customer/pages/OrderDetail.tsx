import { useParams, Link, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, ArrowLeft, Clock, MessageCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { Button, Card, OrderStatusBadge, Avatar, Skeleton } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { formatDateTime, timeAgo, formatRank } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import type { Order, OrderMessage, OrderStatusHistory } from '@/types'

function useOrder(id: string, refetchInterval?: number) {
  return useQuery({
    queryKey: ['order', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('orders').select('*').eq('id', id).single()
      if (error) throw error
      return data as Order
    },
    refetchInterval,
  })
}

function useOrderMessages(orderId: string) {
  return useQuery({
    queryKey: ['order-messages', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_messages')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as OrderMessage[]
    },
    refetchInterval: 5000,
  })
}

function useOrderHistory(orderId: string) {
  return useQuery({
    queryKey: ['order-history', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_status_history')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as OrderStatusHistory[]
    },
  })
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const { profile } = useAuthStore()
  const { t } = useTranslation()
  const currency = useCurrency()
  const queryClient = useQueryClient()
  const [message, setMessage] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const paymentJustCompleted = searchParams.get('payment') === 'success'

  // Poll every 2 s for 30 s after a Stripe redirect so the webhook status
  // update shows up quickly. After that, fall back to no auto-refetch.
  const [pollFast, setPollFast] = useState(paymentJustCompleted)
  useEffect(() => {
    if (!paymentJustCompleted) return
    // Clear the query param from URL so it doesn't persist on refresh
    setSearchParams({}, { replace: true })
    const timer = setTimeout(() => setPollFast(false), 30_000)
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: order, isLoading } = useOrder(id!, pollFast ? 2000 : undefined)
  const { data: messages } = useOrderMessages(id!)
  const { data: history } = useOrderHistory(id!)

  // Stop fast-polling once the order leaves awaiting_payment
  useEffect(() => {
    if (pollFast && order && order.status !== 'awaiting_payment') {
      setPollFast(false)
    }
  }, [order, pollFast])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase.from('order_messages').insert({
        order_id: id,
        sender_id: profile?.id,
        sender_role: profile?.role,
        content,
        is_read: false,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setMessage('')
      queryClient.invalidateQueries({ queryKey: ['order-messages', id] })
    },
  })

  if (isLoading) return (
    <div className="max-w-4xl space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  )

  if (!order) return null

  const isPendingPayment = order.status === 'awaiting_payment'

  return (
    <div className="max-w-4xl space-y-6">
      {/* Payment success banner */}
      {paymentJustCompleted && !pollFast && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-success/10 border border-success/25">
          <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-success">{t('customer.order.paymentSuccess')}</p>
            <p className="text-xs text-ink-secondary mt-0.5">{t('customer.order.paymentSuccessDesc')}</p>
          </div>
        </div>
      )}

      {/* Polling banner — webhook still being processed */}
      {pollFast && isPendingPayment && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-info/10 border border-info/25">
          <Loader2 className="h-5 w-5 text-info shrink-0 mt-0.5 animate-spin" />
          <div>
            <p className="text-sm font-semibold text-info">{t('customer.order.paymentProcessing')}</p>
            <p className="text-xs text-ink-secondary mt-0.5">{t('customer.order.paymentProcessingDesc')}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link to="/orders"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-ink">
              {t('customer.order.id', { id: order.id.slice(0, 8).toUpperCase() })}
            </h1>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="text-sm text-ink-secondary mt-0.5">
            {t('customer.order.created', { date: formatDateTime(order.created_at) })}
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-5">
          {/* Order details */}
          <Card padding="md">
            <h3 className="text-sm font-semibold text-ink mb-4">{t('customer.order.details')}</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: t('customer.order.service'),     value: (order.service_id as string).replace(/_/g, ' ') },
                { label: t('customer.order.server'),      value: order.server },
                { label: t('customer.order.queue'),       value: order.queue_type === 'solo_duo' ? t('customer.order.soloQueue') : t('customer.order.flexQueue') },
                {
                  label: t('customer.order.currentRank'),
                  value: order.current_rank ? formatRank(
                    (order.current_rank as { tier: string }).tier as never,
                    (order.current_rank as { division: string }).division
                  ) : '—',
                },
                {
                  label: t('customer.order.targetRank'),
                  value: order.target_rank ? formatRank(
                    (order.target_rank as { tier: string }).tier as never,
                    (order.target_rank as { division: string }).division
                  ) : '—',
                },
                { label: t('customer.order.totalPaid'),   value: currency(order.total_price) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-ink-muted">{label}</p>
                  <p className="text-sm font-semibold text-ink mt-0.5 capitalize">{value}</p>
                </div>
              ))}
            </div>

            {order.customer_notes && (
              <div className="mt-4 pt-4 border-t border-bg-elevated">
                <p className="text-xs text-ink-muted mb-1">{t('customer.order.notes')}</p>
                <p className="text-sm text-ink-secondary">{order.customer_notes}</p>
              </div>
            )}
          </Card>

          {/* Chat */}
          <Card padding="none" className="flex flex-col">
            <div className="flex items-center gap-2 p-4 border-b border-bg-elevated">
              <MessageCircle className="h-4 w-4 text-brand" />
              <h3 className="text-sm font-semibold text-ink">{t('customer.order.chat')}</h3>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px] max-h-[400px]">
              {!messages?.length ? (
                <p className="text-xs text-ink-muted text-center py-8">
                  {t('customer.order.noMessages')}
                </p>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.sender_id === profile?.id
                  return (
                    <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                      <Avatar name={msg.sender_role} size="xs" />
                      <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                        <div className={`px-3 py-2 rounded-2xl text-sm ${
                          isMe
                            ? 'bg-brand text-white rounded-tr-sm'
                            : 'bg-bg-elevated text-ink rounded-tl-sm'
                        }`}>
                          {msg.content}
                        </div>
                        <span className="text-[10px] text-ink-muted">{timeAgo(msg.created_at)}</span>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message input */}
            <div className="border-t border-bg-elevated p-3 flex gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && message.trim()) {
                    e.preventDefault()
                    sendMessage.mutate(message.trim())
                  }
                }}
                placeholder={t('customer.order.messagePlaceholder')}
                className="input-base flex-1 py-2 text-sm"
              />
              <Button
                size="icon"
                onClick={() => message.trim() && sendMessage.mutate(message.trim())}
                loading={sendMessage.isPending}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        </div>

        {/* Timeline */}
        <div className="space-y-4">
          <Card padding="md">
            <h3 className="text-sm font-semibold text-ink mb-4">{t('customer.order.timeline')}</h3>
            {!history?.length ? (
              <p className="text-xs text-ink-muted">{t('customer.order.noHistory')}</p>
            ) : (
              <div className="relative">
                <div className="absolute left-3.5 top-4 bottom-4 w-px bg-bg-elevated" />
                <div className="space-y-4">
                  {history.map((entry, idx) => (
                    <div key={entry.id} className="flex items-start gap-4 relative">
                      <div className={`h-7 w-7 rounded-full border-2 flex items-center justify-center shrink-0 z-10 ${
                        idx === history.length - 1
                          ? 'border-brand bg-brand'
                          : 'border-bg-elevated bg-bg-surface'
                      }`}>
                        <Clock className="h-3 w-3 text-white" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-ink capitalize">
                          {entry.to_status.replace(/_/g, ' ')}
                        </p>
                        <p className="text-[10px] text-ink-muted mt-0.5">
                          {timeAgo(entry.created_at)}
                        </p>
                        {entry.reason && (
                          <p className="text-xs text-ink-secondary mt-0.5">{entry.reason}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Support */}
          <Card padding="md" variant="brand">
            <p className="text-sm font-semibold text-ink mb-1">{t('customer.order.needHelp')}</p>
            <p className="text-xs text-ink-secondary mb-3">{t('customer.order.ticketDesc')}</p>
            <Button asChild variant="secondary" size="sm" className="w-full">
              <Link to="/support">{t('customer.order.openTicket')}</Link>
            </Button>
          </Card>
        </div>
      </div>
    </div>
  )
}
