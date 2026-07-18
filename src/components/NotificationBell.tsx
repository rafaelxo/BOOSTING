import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, MessageCircle, Trophy, CreditCard, Star, UserCheck, Briefcase, RefreshCw } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'
import type { Notification, NotificationType } from '@/types'
import { useNotifications, useMarkNotificationsRead } from '@/api/notifications'

const TYPE_ICON: Record<NotificationType, React.ElementType> = {
  order_status_changed: RefreshCw,
  order_assigned: Briefcase,
  order_completed: Trophy,
  message_received: MessageCircle,
  ticket_updated: MessageCircle,
  payment_confirmed: CreditCard,
  review_received: Star,
  booster_approved: UserCheck,
  exclusive_job: Briefcase,
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString('pt-BR')
}

function orderPathForRole(role: string | undefined, orderId: string): string {
  if (role === 'admin') return `/admin/orders/${orderId}`
  if (role === 'booster') return `/booster/jobs/${orderId}`
  return `/orders/${orderId}`
}

export function NotificationBell() {
  const { profile } = useAuthStore()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data: notifications = [] } = useNotifications(profile?.id)
  const markRead = useMarkNotificationsRead(profile?.id)

  const unreadCount = notifications.filter((n) => !n.is_read).length

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function markAsRead(ids: string[]) {
    if (!ids.length) return
    markRead.mutate(ids)
  }

  function handleItemClick(n: Notification) {
    if (!n.is_read) markAsRead([n.id])
    const notificationData = n.data as { order_id?: string; requires_credentials?: boolean }
    const orderId = notificationData?.order_id
    if (orderId) {
      const credentialsHash = profile?.role === 'customer' && notificationData.requires_credentials
        ? '#credentials'
        : ''
      navigate(`${orderPathForRole(profile?.role, orderId)}${credentialsHash}`)
    }
    setOpen(false)
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2.5 rounded-xl text-ink-secondary hover:text-ink hover:bg-bg-elevated transition-colors"
        aria-label="Notificações"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[9px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-[420px] flex flex-col bg-bg-surface border border-bg-elevated rounded-2xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-bg-elevated shrink-0">
            <p className="text-sm font-bold text-ink">Notificações</p>
            {unreadCount > 0 && (
              <button
                onClick={() => markAsRead(notifications.filter((n) => !n.is_read).map((n) => n.id))}
                className="flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
              >
                <CheckCheck className="h-3 w-3" /> Marcar todas
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-sm text-ink-muted text-center py-8">Nenhuma notificação ainda.</p>
            ) : (
              notifications.map((n) => {
                const Icon = TYPE_ICON[n.type] ?? Bell
                return (
                  <button
                    key={n.id}
                    onClick={() => handleItemClick(n)}
                    className={cn(
                      'w-full text-left flex items-start gap-3 px-4 py-3 border-b border-bg-elevated last:border-0 transition-colors hover:bg-bg-elevated',
                      !n.is_read && 'bg-brand/5',
                    )}
                  >
                    <div className={cn(
                      'h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                      n.is_read ? 'bg-bg-elevated text-ink-muted' : 'bg-brand/15 text-brand',
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn('text-xs font-semibold text-ink truncate', !n.is_read && 'font-bold')}>{n.title}</p>
                        {!n.is_read && <span className="h-1.5 w-1.5 rounded-full bg-brand shrink-0 mt-1" />}
                      </div>
                      <p className="text-xs text-ink-secondary mt-0.5 line-clamp-2">{n.body}</p>
                      <p className="text-[10px] text-ink-muted mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
